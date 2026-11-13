"""Web Push: notifications to the owner's phone or computer, straight from the browser's own push service.

Payloads are end-to-end encrypted to each subscribed device (the Web Push standard), so the push relay
(Google's or Apple's) sees only ciphertext. VAPID keys are generated once and kept in /data.
"""
import asyncio
import base64
import json
import os
import time

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01
from pywebpush import WebPushException, webpush

SUB_CLAIM = os.environ.get("RELIQUARY_PUSH_SUB") or "https://" + os.environ.get("RELIQUARY_DOMAIN", "localhost")


class Push:
    def __init__(self, db, data_dir):
        self.db = db
        self.key_path = os.path.join(data_dir, "vapid.pem")
        if not os.path.exists(self.key_path):
            v = Vapid01()
            v.generate_keys()
            v.save_key(self.key_path)
            os.chmod(self.key_path, 0o600)
        v = Vapid01.from_file(self.key_path)
        raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        self.public_key = base64.urlsafe_b64encode(raw).decode().rstrip("=")
        db.x("CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY, data TEXT NOT NULL, created REAL NOT NULL, agent TEXT)")

    def subscribe(self, sub, agent=""):
        if not isinstance(sub, dict) or not str(sub.get("endpoint", "")).startswith("https://") or "keys" not in sub:
            raise ValueError("not a push subscription")
        self.db.x("INSERT INTO push_subs(endpoint,data,created,agent) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET data=excluded.data",
                  (sub["endpoint"], json.dumps(sub), time.time(), (agent or "")[:200]))

    def unsubscribe(self, endpoint):
        self.db.x("DELETE FROM push_subs WHERE endpoint=?", (endpoint,))

    def count(self):
        return self.db.one("SELECT COUNT(*) AS n FROM push_subs")["n"]

    def _send_one(self, sub, payload):
        try:
            webpush(subscription_info=sub, data=payload, vapid_private_key=self.key_path,
                    vapid_claims={"sub": SUB_CLAIM}, ttl=6 * 3600, timeout=15)
            return True
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):  # the device unsubscribed or the browser was reset
                self.unsubscribe(sub["endpoint"])
            return False
        except Exception:
            return False

    async def send(self, title, body="", url="/", tag=None, quiet_if_visible=False):
        """Notify every subscribed device. quiet_if_visible: skip devices where Reliquary is open on screen."""
        payload = json.dumps({"title": title, "body": body[:240], "url": url, "tag": tag or "reliquary",
                              "quiet_if_visible": quiet_if_visible})
        subs = [json.loads(r["data"]) for r in self.db.q("SELECT data FROM push_subs")]
        results = await asyncio.gather(*(asyncio.to_thread(self._send_one, s, payload) for s in subs))
        return sum(results)
