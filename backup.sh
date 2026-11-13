#!/bin/sh
# Nightly Reliquary backup (cron, 22:00 UTC = 03:30 India time). One tar.gz per night in ~/backups/reliquary, the newest 14 kept.
# Contains: a consistent copy of the database (chats, tasks, notes, memories, settings), your own skills,
# the workspaces (without node_modules/.venv/build output), and the configuration needed to rebuild the stack.
# Restore: stop the app, untar into a temp folder, copy data/reliquary.db back into ~/reliquary/data/.
set -eu
SRC="$HOME/reliquary"
DEST="$HOME/backups/reliquary"
STAMP=$(date +%Y%m%d-%H%M)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST" "$TMP/data"

# SQLite's online backup gives a consistent copy even while the app is writing.
python3 - "$SRC/data/reliquary.db" "$TMP/data/reliquary.db" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()
PY
[ -d "$SRC/data/skills" ] && cp -a "$SRC/data/skills" "$TMP/data/"
cp -a "$SRC/.env" "$SRC/compose.yml" "$TMP/" 2>/dev/null || true
cp -a "$SRC/caddy" "$SRC/searxng" "$TMP/" 2>/dev/null || true

tar czf "$DEST/reliquary-$STAMP.tar.gz" \
  --exclude='node_modules' --exclude='.venv' --exclude='venv' --exclude='__pycache__' --exclude='dist' --exclude='build' \
  --exclude='riri-scratch' \
  -C "$TMP" . -C "$SRC" workspaces
chmod 600 "$DEST/reliquary-$STAMP.tar.gz"

# keep the newest 14
ls -1t "$DEST"/reliquary-*.tar.gz | tail -n +15 | xargs -r rm -f
echo "$(date '+%F %T') backup ok: reliquary-$STAMP.tar.gz ($(du -h "$DEST/reliquary-$STAMP.tar.gz" | cut -f1))" >> "$DEST/backup.log"
