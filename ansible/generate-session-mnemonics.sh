#!/usr/bin/env bash
# generate-session-mnemonics.sh
#
# Generates one fresh sr25519 mnemonic per validator node.
# Pass node names as arguments -- they must match the hostnames in inventory.ini
#
# Usage:
#   ./generate-session-mnemonics.sh node1 node2 node3
#   ./generate-session-mnemonics.sh myvalidator-us myvalidator-eu
#
# The node names must exactly match the hostnames in inventory.ini.
#
# Output format is ready to paste into group_vars/session_keys.vault.yml
#
# Then encrypt:
#   ansible-vault create group_vars/session_keys.vault.yml
#
# WARNING: do NOT paste mnemonics into a browser, chat, or email.

set -euo pipefail

# Use binary from role files dir, or override with NULLA_RELAY_BIN env var
BINARY="${NULLA_RELAY_BIN:-./roles/nulla-relay/files/nulla-relay}"

if [[ ! -x "$BINARY" ]]; then
  BINARY="$(which nulla-relay 2>/dev/null || true)"
  if [[ -z "$BINARY" ]] || [[ ! -x "$BINARY" ]]; then
    echo "ERROR: nulla-relay binary not found." >&2
    echo "Copy it to roles/nulla-relay/files/ or set NULLA_RELAY_BIN=/path/to/nulla-relay" >&2
    exit 1
  fi
fi

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <node_name> [node_name ...]" >&2
  echo "Example: $0 node1 node2 node3" >&2
  echo "Node names must match hostnames in inventory.ini" >&2
  exit 1
fi

echo "# Paste this block into group_vars/session_keys.vault.yml"
echo "# Then: ansible-vault create group_vars/session_keys.vault.yml"
echo ""
echo "session_mnemonics:"

for NODE in "$@"; do
  MNEMONIC=$("$BINARY" key generate --scheme sr25519 --output-type Json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['secretPhrase'])")
  printf '  %s: "%s"\n' "$NODE" "$MNEMONIC"
done

echo ""
echo "# IMPORTANT: back up every mnemonic before encrypting."
echo "# To recover keys on a rebuilt server:"
echo "#   ansible-playbook site.yml --ask-vault-pass --limit <node_name> --tags keys"
