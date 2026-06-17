# Nulla Mainnet — Validator Node Setup

Run a validator on the Nulla relay chain and help secure the network.

---

## What's in this package

```
binaries/
  nulla-relay                   Main node binary
  polkadot-prepare-worker       Required worker (PVF)
  polkadot-execute-worker       Required worker (PVF)

chainspec/
  nulla-mainnet.raw.json        Pre-built genesis — DO NOT REBUILD

ansible/                        Automated multi-node setup
docs/                           Guides and reference files
```

---

## Requirements

| | Minimum | Recommended |
|---|---|---|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16 GB |
| Disk | 200 GB SSD | 500 GB NVMe |
| OS | Ubuntu 22.04 | Ubuntu 22.04 |
| Open ports | 30333/tcp (P2P) | + 9944 if you want RPC |

---

## Two ways to run a validator

### Option A — Ansible (recommended for multiple nodes)

Automated deployment to one or many servers from a single control machine.

→ See [ANSIBLE_SETUP.md](ANSIBLE_SETUP.md)

### Option B — Manual (single node, no extra tools)

Install directly on one server without Ansible.

→ See [MANUAL_SETUP.md](MANUAL_SETUP.md)

---

## Connecting to the network

The chainspec at `chainspec/nulla-mainnet.raw.json` has the official bootnodes hardcoded.
Your node will find peers automatically — no extra configuration needed.

**Do not rebuild the chainspec.** Nodes with a different chainspec will be on a different chain.

---

## Getting your validator onchain

After your node is running and synced, you need to:

1. Bond tokens from your stash wallet (min 20,000,000 NULLA recommended)
2. Set session keys (`author_rotateKeys` RPC → `session.setKeys` extrinsic)
3. Call `staking.validate` from your stash wallet

Use official nulla extention https://github.com/NullaZK/NULLA-extension connected to the official nulla explorer https://www.nullascan.com/

---

## Support

Open an issue on the repository or join the community channel.
