#!/bin/sh
# Installs the `reliquary` terminal client for the current user (no sudo): a private venv + ~/.local/bin/reliquary
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="$HOME/.local/share/reliquary-cli"
if ! python3 -m venv "$VENV" >/dev/null 2>&1; then
  # python3-venv (ensurepip) is not installed and needs sudo; bootstrap pip into a bare venv instead
  rm -rf "$VENV"
  python3 -m venv --without-pip "$VENV"
  curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
  "$VENV/bin/python" /tmp/get-pip.py -q
  rm -f /tmp/get-pip.py
fi
"$VENV/bin/pip" install -q "rich==13.9.4" "prompt_toolkit==3.0.48" "httpx==0.28.1"
install -m 755 "$HERE/reliquary.py" "$VENV/reliquary.py"
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/reliquary" <<EOF
#!/bin/sh
exec "$VENV/bin/python" "$VENV/reliquary.py" "\$@"
EOF
chmod 755 "$HOME/.local/bin/reliquary"
# RiRi answers to her own name too
ln -sf "$HOME/.local/bin/reliquary" "$HOME/.local/bin/riri"
ln -sf "$HOME/.local/bin/reliquary" "$HOME/.local/bin/RiRi"
echo "Installed. Run: riri"
