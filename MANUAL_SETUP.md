# Manual Validator Setup (no Ansible)

For running a single validator on one server without Ansible.

---

## 1. Create the nulla system user

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin nulla
```

---

## 2. Create directories

```bash
sudo mkdir -p /usr/local/bin
sudo mkdir -p /etc/nulla
sudo mkdir -p /var/lib/nulla/relay
sudo chown -R nulla:nulla /var/lib/nulla
```

---

## 3. Install binaries

```bash
sudo cp binaries/nulla-relay           /usr/local/bin/nulla-relay
sudo cp binaries/polkadot-prepare-worker /usr/local/bin/polkadot-prepare-worker
sudo cp binaries/polkadot-execute-worker /usr/local/bin/polkadot-execute-worker
sudo chmod +x /usr/local/bin/nulla-relay \
              /usr/local/bin/polkadot-prepare-worker \
              /usr/local/bin/polkadot-execute-worker
```

---

## 4. Install chainspec

```bash
sudo cp chainspec/nulla-mainnet.raw.json /etc/nulla/nulla-mainnet.raw.json
sudo chmod 644 /etc/nulla/nulla-mainnet.raw.json
```

---

## 5. Generate P2P node key

```bash
sudo -u nulla /usr/local/bin/nulla-relay key generate-node-key \
  --file /var/lib/nulla/relay/node.key

# Show your peer ID (share this if you want to be added as a bootnode)
/usr/local/bin/nulla-relay key inspect-node-key \
  --file /var/lib/nulla/relay/node.key
```

---

## 6. Insert session keys

Generate a mnemonic (or use an existing one — keep it secret):

```bash
/usr/local/bin/nulla-relay key generate --scheme sr25519
```

Insert all 6 key types from the same mnemonic:

```bash
MNEMONIC="your twelve word mnemonic phrase here"
KEYSTORE=/var/lib/nulla/relay/chains/nulla_mainnet/keystore

sudo mkdir -p $KEYSTORE
sudo chown nulla:nulla $KEYSTORE
sudo chmod 700 $KEYSTORE

for TYPE in babe gran audi asgn para; do
  SCHEME=sr25519
  [ "$TYPE" = "gran" ] && SCHEME=ed25519
  sudo -u nulla /usr/local/bin/nulla-relay key insert \
    --keystore-path $KEYSTORE \
    --scheme $SCHEME \
    --key-type $TYPE \
    --suri "$MNEMONIC"
done

# BEEFY key uses ecdsa
sudo -u nulla /usr/local/bin/nulla-relay key insert \
  --keystore-path $KEYSTORE \
  --scheme ecdsa \
  --key-type beef \
  --suri "$MNEMONIC"

sudo chmod 700 $KEYSTORE
sudo chmod 600 $KEYSTORE/*
```

---

## 7. Install and start systemd service

```bash
sudo cp docs/nulla-relay.service.example /etc/systemd/system/nulla-relay.service

# Edit the service file: replace YOUR_NODE_NAME with your chosen node name
sudo nano /etc/systemd/system/nulla-relay.service

sudo systemctl daemon-reload
sudo systemctl enable nulla-relay
sudo systemctl start nulla-relay
```

---

## 8. Check it's working

```bash
sudo journalctl -u nulla-relay -f
```

Expected output after a few seconds:
```
💤 Idle (N peers), best: #XYZ, finalized #XYZ
🏆 Imported #XYZ
```

---

## 9. Open firewall

```bash
sudo ufw allow 30333/tcp   # P2P — required
# sudo ufw allow 9944/tcp  # RPC — only if you need external access
sudo ufw enable
```

---

## 10. Register as validator onchain

Once synced to the tip:

1. Get your session pubkeys:
```bash
curl -sX POST http://localhost:9944 \
  -H "Content-Type: application/json" \
  -d '{"id":1,"jsonrpc":"2.0","method":"author_rotateKeys","params":[]}' \
  | python3 -m json.tool
```

2. In [Polkadot.js Apps](https://polkadot.js.org/apps):
   - **Developer → Extrinsics → session → setKeys** (paste the hex from above)
   - **Developer → Extrinsics → staking → validate**
   - Bond tokens: **Developer → Extrinsics → staking → bond**

---

## Upgrading the binary

```bash
sudo systemctl stop nulla-relay
sudo cp new-nulla-relay /usr/local/bin/nulla-relay
sudo chmod +x /usr/local/bin/nulla-relay
sudo systemctl start nulla-relay
```

The runtime upgrades automatically from the chain — no chainspec change needed.
