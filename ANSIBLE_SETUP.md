# Ansible Validator Setup (multi-node)

Deploy and manage one or many validators from a single control machine.

---

## Requirements on the control machine

```bash
sudo apt install ansible sshpass python3-yaml
```

Ansible 2.17+ recommended.

---

## Requirements on each validator server

- Ubuntu 22.04
- SSH access (root or a user with sudo)
- Ports 30333/tcp open

---

## 1. Copy binaries into the Ansible role

```bash
cp binaries/nulla-relay                ansible/roles/nulla-relay/files/nulla-relay
cp binaries/polkadot-prepare-worker    ansible/roles/nulla-relay/files/polkadot-prepare-worker
cp binaries/polkadot-execute-worker    ansible/roles/nulla-relay/files/polkadot-execute-worker
cp chainspec/nulla-mainnet.raw.json    ansible/roles/nulla-relay/files/nulla-mainnet.raw.json
```

---

## 2. Configure inventory

```bash
cd ansible/
cp inventory.ini.example inventory.ini
nano inventory.ini   # fill in your server IPs and SSH details
```

---

## 3. Create stash accounts

Create one sr25519 wallet per validator in Polkadot.js extension or with subkey.
Fill in `group_vars/stash_accounts.yml`:

```bash
cp group_vars/stash_accounts.yml.example group_vars/stash_accounts.yml
nano group_vars/stash_accounts.yml
```

---

## 4. Generate session mnemonics and create vault

```bash
./generate-session-mnemonics.sh
```

Copy the output. Then create the encrypted vault:

```bash
ansible-vault create group_vars/session_keys.vault.yml
```

Paste the mnemonics in this format and save:

```yaml
session_mnemonics:
  node1: "word word word ..."
  node2: "word word word ..."
  # one per node matching your inventory
```

**Save the mnemonics securely before encrypting** — they are needed for recovery.

---

## 5. Push SSH keys to new servers (first time only)

```bash
apt install sshpass
ansible-playbook 00-push-ssh-keys.yml --ask-pass
```

This creates the `NULLADEV` user with sudo and installs your SSH key on all nodes.

---

## 6. Deploy

```bash
ansible-playbook site.yml --ask-vault-pass
```

This runs 4 plays:
- **Play 1**: OS setup (user, dirs, UFW, binaries)
- **Play 2**: Insert session keys from vault, generate P2P keys
- **Play 3**: Build raw chainspec with your keys and stash addresses
- **Play 4**: Deploy chainspec, install systemd unit, start validators

---

## Single node operations

```bash
# Deploy/redeploy one node only
ansible-playbook site.yml --ask-vault-pass --limit node2

# Re-insert session keys (e.g. after server rebuild)
ansible-playbook site.yml --ask-vault-pass --limit node2 --tags keys

# Restart one node
ansible node2 -m systemd -a "name=nulla-relay state=restarted" --become

# Check logs on all nodes
ansible all_validators -m shell \
  -a "journalctl -u nulla-relay -n 20 --no-pager" --become
```

---

## Adding more validators

1. Add new servers to `inventory.ini` under `[validator_nodes]`
2. Add their stash addresses to `group_vars/stash_accounts.yml`
3. Add their mnemonics to the vault: `ansible-vault edit group_vars/session_keys.vault.yml`
4. Run: `ansible-playbook site.yml --ask-vault-pass --limit nodeN`

---

## Recovery (server rebuilt)

The vault holds all session mnemonics — the keystore is always reconstructible:

```bash
ansible-playbook site.yml --ask-vault-pass --limit nodeN --tags keys
```

---

## Stopping validators (preserves all data)

```bash
ansible all_validators -m systemd \
  -a "name=nulla-relay state=stopped enabled=false" --become
```

Restart:
```bash
ansible all_validators -m systemd \
  -a "name=nulla-relay state=started enabled=true" --become
```
