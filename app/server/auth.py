"""Password (scrypt), TOTP, login sessions, the local CLI token and a global login throttle.

The site is public, and behind sslh every visitor appears to come from 127.0.0.1, so the throttle is global
rather than per address: after 5 failures in a minute, logins are refused with growing lockouts.
"""
import base64
import hashlib
import hmac
import os
import secrets
import struct
import time

SESSION_DAYS = 30


def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 15, r=8, p=1, maxmem=64 * 1024 * 1024)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(h).decode()


def check_password(pw: str, stored: str) -> bool:
    try:
        _, salt, h = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=base64.b64decode(salt), n=2 ** 15, r=8, p=1, maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(got, base64.b64decode(h))
    except Exception:
        return False


def new_totp_secret() -> str:
    return base64.b32encode(os.urandom(20)).decode().rstrip("=")


def totp_code(secret: str, t=None) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    counter = int((t or time.time()) // 30)
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    o = mac[-1] & 0x0F
    return str((struct.unpack(">I", mac[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000).zfill(6)


def check_totp(secret: str, code: str) -> bool:
    code = (code or "").strip().replace(" ", "")
    now = time.time()
    return any(hmac.compare_digest(totp_code(secret, now + d * 30), code) for d in (-1, 0, 1))


def token_hash(tok: str) -> str:
    return hashlib.sha256(tok.encode()).hexdigest()


class Throttle:
    def __init__(self):
        self.failures = []
        self.locked_until = 0.0
        self.strikes = 0

    def blocked(self):
        return max(0, int(self.locked_until - time.time()))

    def fail(self):
        now = time.time()
        self.failures = [t for t in self.failures if now - t < 60] + [now]
        if len(self.failures) >= 5:
            self.strikes += 1
            self.locked_until = now + min(3600, 30 * 2 ** (self.strikes - 1))
            self.failures = []

    def success(self):
        self.failures, self.strikes = [], 0


class Auth:
    def __init__(self, db, data_dir, dev_noauth=False):
        self.db = db
        self.dev_noauth = dev_noauth
        self.throttle = Throttle()
        self.cli_token_path = os.path.join(data_dir, "cli.token")
        if not os.path.exists(self.cli_token_path):
            fd = os.open(self.cli_token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(secrets.token_urlsafe(32))
        with open(self.cli_token_path) as f:
            self.cli_token = f.read().strip()

    @property
    def password_set(self):
        return bool(self.db.get("password_hash"))

    @property
    def totp_enabled(self):
        return bool(self.db.get("totp_secret"))

    def login(self, password, code, agent=""):
        """Returns (cookie_token, error, retry_after)."""
        wait = self.throttle.blocked()
        if wait:
            return None, f"Too many attempts. Try again in {wait} seconds.", wait
        stored = self.db.get("password_hash")
        if not stored:
            return None, "No password is set yet. Run `riri passwd` on the server.", 0
        ok = check_password(password or "", stored)
        if ok and self.totp_enabled:
            ok = check_totp(self.db.get("totp_secret"), code)
            if not ok and not code:
                return None, "Enter the 6-digit code from your authenticator app.", 0
        if not ok:
            self.throttle.fail()
            return None, "That password or code is not right.", 0
        self.throttle.success()
        tok = secrets.token_urlsafe(32)
        now = time.time()
        self.db.x("INSERT INTO logins(token_hash,created,expires,agent) VALUES(?,?,?,?)",
                  (token_hash(tok), now, now + SESSION_DAYS * 86400, (agent or "")[:200]))
        self.db.x("DELETE FROM logins WHERE expires<?", (now,))
        return tok, None, 0

    def logout(self, tok):
        if tok:
            self.db.x("DELETE FROM logins WHERE token_hash=?", (token_hash(tok),))

    def logout_everywhere(self):
        self.db.x("DELETE FROM logins")

    def check(self, cookie_tok, bearer):
        """Returns 'cli', 'web' or None."""
        if self.dev_noauth:
            return "cli"
        if bearer and hmac.compare_digest(bearer, self.cli_token):
            return "cli"
        if cookie_tok:
            row = self.db.one("SELECT expires FROM logins WHERE token_hash=?", (token_hash(cookie_tok),))
            if row and row["expires"] > time.time():
                return "web"
        return None
