# ProofHub — public post-quantum proof

This tiny package lets **anyone** verify, independently, that a real deposit
on **ProofHub Mainnet** was created using a NIST FIPS 204 **ML-DSA-44**
post-quantum key, that the matching withdraw was authorised by that key on
chain, and that the runtime really verifies ML-DSA-44 signatures and
Winterfell ZK-STARK proofs at the protocol layer.

It contains **no secrets**. Everything in [proof-package.json](proof-package.json)
is either already public on chain or refers to an already-spent note.

## What is proven

1. **Post-quantum key size** — the wallet public key is exactly **1312 bytes**,
   the size mandated by NIST FIPS 204 for ML-DSA-44.
2. **Wallet → deposit link** — the commitment in the package equals the
   commitment recorded by the `proofs.DepositV2Accepted` event at the
   referenced deposit block.
3. **Wallet → withdraw link** — the wallet's ML-DSA-44 public key AND its full
   32-byte nullifier appear verbatim inside the withdraw extrinsic at the
   referenced withdraw block.
4. **Privacy property (for this transaction pair)** — the deposit's commitment
   leaf is NOT present inside the withdraw extrinsic. An external observer
   sees a withdraw happen but cannot tell which deposit it spent.
5. **Runtime really verifies ML-DSA-44 and STARK** — the on-chain runtime
   (`proofhub-runtime v127`) depends on the `fips204` crate and calls
   `ml_dsa_44::PublicKey::try_from_bytes(...).verify(...)` on every
   `withdraw_v2` / `purchase_rwa_v2`; it also calls Winterfell
   (`winter_verifier`) to check ZK-STARK proofs. See the *Honest scope*
   section below for the exact code references.

## What is NOT in this package

- `ml_dsa_sk_hex` — the secret key. **Never** published, never sharable.
- Any unspent note. The note referenced here has `status: spent`, so revealing
  its blinding factor does not de-anonymise any active funds.

## Run it

```bash
git clone <this repo>
cd proofhub-public-proof
npm install
npm run verify
```

You should see green check marks and the verdict block at the bottom.

## Honest scope

This package combines two layers of evidence.

**Layer 1 — Live RPC verification** (run `npm run verify`)

Proves, against the public node, that the wallet's 1312-byte public key and
full 32-byte nullifier appear verbatim inside the on-chain extrinsics at
blocks #2412 and #2438, and that the deposit's leaf commitment does **not**
appear inside the withdraw extrinsic.

**Layer 2 — Pallet source review** (`proofs` pallet + `ProofVerifier`
implementation, `proofhub-runtime v127`)

From the executable Rust code, independent of doc comments:

- `withdraw_v2` and `purchase_rwa_v2` are unsigned extrinsics
  (`ensure_none(origin)?`).
- Both enforce `auth.len() == DILITHIUM_PK_LEN + DILITHIUM_SIG_LEN`
  (1312 + 2420 = 3732 bytes) and split `auth` into a public key and a
  signature.
- The verifier crate imports `fips204::ml_dsa_44` and
  `fips204::traits::Verifier` (the published NIST FIPS 204 reference crate)
  and calls
  ```rust
  ml_dsa_44::PublicKey::try_from_bytes(pk_arr)?.verify(message, &sig, &[])
  ```
  on the parsed key. A failing verify aborts the extrinsic with
  `Error::MlDsaFailed`. ML-DSA-44 verification is therefore performed by the
  runtime itself, not asserted by a comment.
- `verify_spend_v2`, `verify_deposit_v2`, `verify_stark_range`,
  `verify_stark_deposit_commit` and `verify_stark_purchase` are implemented on
  top of the `winter_verifier` / `winterfell` STARK library
  (`winter_verifier::crypto::hashers::Blake3_256` is the chosen hasher).
  These functions are called from the pallet and a `false` return aborts the
  extrinsic with `Error::ProofVerificationFailed`. The proof system in use is
  therefore Winterfell-style ZK-STARK with BLAKE3 hashing.
- `blake3::Hasher::new()` is also called directly to build the public-key
  digest (`pkd = BLAKE3("nulla_pk_digest_v2" ‖ ml_dsa_pk)`) and the various
  commitment hashes.

The outer Substrate transaction layer is classical: the deposit observed in
this proof is wrapped in a signed extrinsic (Sr25519, 64-byte signature)
that pays the network fee, while the withdraw extrinsic is unsigned. The
post-quantum and ZK material is in the call payload, where the runtime
actually verifies it.

A third-party reviewer can confirm everything above by reading the `proofs`
pallet source and the `ProofVerifier` implementation, and by checking that
the runtime crate depends on `fips204`, `blake3`, `winter_verifier` and
`winterfell`.


## Notes are designed to be re-spent on chain

Withdraw to a public account is only one of several extrinsics exposed by the
`proofs` pallet of `proofhub-runtime v127`. From the executable code we can
state the following without relying on comments:

- `purchase_rwa_v2` calls `Self::v2_insert(inputs.change_leaf)` and emits
  `Event::PurchaseV2Authorized { rwa_id, tx_id, change_leaf, change_leaf_index,
  new_root }`. Therefore every successful purchase inserts a fresh leaf into
  the merkle tree and records it on chain.
- The pallet also exposes `relist_private`, which by its presence and call
  signature is intended for in-protocol resale of ownership records.

What this implies for the privacy model is a matter of design and should be
confirmed against the wallet code and the `ProofVerifier` implementation:
each purchase plausibly grows the anonymity set with a new commitment, so the
deposit/withdraw flow used in this demo is the simplest path rather than the
full intended usage.
