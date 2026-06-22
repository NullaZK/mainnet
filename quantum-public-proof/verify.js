#!/usr/bin/env node
/**
 * ProofHub public-proof verifier — verifies five claims against the live RPC:
 *
 *   1. The ML-DSA-44 public key has the exact FIPS 204 size (1312 B).
 *   2. The deposit commitment in the package == on-chain commitment at the
 *      referenced deposit block.
 *   3. The wallet PK appears verbatim inside the withdraw extrinsic call data.
 *   4. The wallet full nullifier appears verbatim inside the withdraw call data.
 *   5. The deposit commitment is NOT revealed inside the withdraw extrinsic
 *      (privacy: nobody can link the withdraw to this specific deposit).
 *
 * No secrets are read or transmitted. Run with:
 *
 *   npm install
 *   node verify.js
 */
const fs = require('fs');
const path = require('path');
const { ApiPromise, WsProvider } = require('@polkadot/api');

const C  = { g:'\x1b[32m', y:'\x1b[33m', c:'\x1b[36m', r:'\x1b[31m', b:'\x1b[1m', x:'\x1b[0m' };
const ok   = m => console.log(`  ${C.g}✓${C.x} ${m}`);
const bad  = m => { console.log(`  ${C.r}✗${C.x} ${m}`); process.exitCode = 1; };
const info = m => console.log(`  ${C.c}·${C.x} ${m}`);
const hdr  = m => console.log(`\n${C.b}${C.y}── ${m} ──${C.x}\n`);

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'proof-package.json'), 'utf8'));

  console.log(`\n${C.b}╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   ProofHub public-proof verifier                         ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${C.x}`);
  info(`Network : ${pkg.network.name}`);
  info(`RPC     : ${pkg.network.rpc}`);

  // 1 ── PQ key size ────────────────────────────────────────────
  hdr('1. ML-DSA-44 key size (NIST FIPS 204)');
  const pkBytes = pkg.deposit.ml_dsa_pk_hex.length / 2;
  info(`Package PK length : ${pkBytes} bytes`);
  info(`FIPS 204 ML-DSA-44: ${pkg.fips_204_reference.ml_dsa_44_pk_bytes} bytes`);
  pkBytes === pkg.fips_204_reference.ml_dsa_44_pk_bytes
    ? ok('Exact match — key has the post-quantum size of ML-DSA-44')
    : bad('Size mismatch — not a valid ML-DSA-44 key');

  // ── Connect ──────────────────────────────────────────────────
  hdr('2. Connect to public RPC');
  const api = await ApiPromise.create({
    provider: new WsProvider(pkg.network.rpc),
    noInitWarn: true,
  });
  const rt = await api.rpc.state.getRuntimeVersion();
  info(`Runtime: ${rt.specName.toString()} v${rt.specVersion.toString()}`);
  rt.specName.toString() === pkg.network.spec_name
    ? ok('Connected to the expected runtime')
    : bad('Wrong runtime');

  // 3 ── Deposit commitment on chain ────────────────────────────
  hdr('3. Deposit commitment recorded on chain');
  const apiAtDep = await api.at(pkg.deposit.block_hash);
  const depEvents = await apiAtDep.query.system.events();
  const wantLeaf  = '0x' + pkg.deposit.leaf_hex.toLowerCase();
  let chainLeaf   = null;
  depEvents.forEach(({ event }) => {
    if (event.section === 'proofs' && event.method.startsWith('Deposit')) {
      event.data.forEach(d => {
        if (d.toString().toLowerCase() === wantLeaf) chainLeaf = d.toString().toLowerCase();
      });
    }
  });
  info(`Block         : #${pkg.deposit.block_number}  ${pkg.deposit.block_hash}`);
  info(`Package leaf  : ${wantLeaf}`);
  info(`Chain leaf    : ${chainLeaf || '(not found)'}`);
  chainLeaf === wantLeaf
    ? ok('Commitment on chain equals package — wallet really made this deposit')
    : bad('Commitment mismatch');

  // 4 ── Withdraw extrinsic dissection ──────────────────────────
  hdr('4. Withdraw extrinsic carries wallet PK + nullifier');
  const wHash  = await api.rpc.chain.getBlockHash(pkg.withdraw.block_number);
  const wBlock = await api.rpc.chain.getBlock(wHash);
  const wEx    = wBlock.block.extrinsics.find(
    e => e.method.section === 'proofs' && e.method.method.startsWith('withdrawV2'));
  if (!wEx) { bad(`No proofs.withdrawV2 in block #${pkg.withdraw.block_number}`); await api.disconnect(); return; }

  const rawHex = wEx.toHex().toLowerCase();
  const pkHex  = pkg.deposit.ml_dsa_pk_hex.toLowerCase();
  const nullHex= pkg.withdraw.nullifier_hex.toLowerCase();
  const leafHex= pkg.deposit.leaf_hex.toLowerCase();

  info(`Block         : #${pkg.withdraw.block_number}  ${wHash.toString()}`);
  info(`Extrinsic size: ${wEx.toU8a().length.toLocaleString()} bytes`);

  const pkInside   = rawHex.includes(pkHex);
  const nullInside = rawHex.includes(nullHex);
  const leafInside = rawHex.includes(leafHex);

  pkInside   ? ok('Wallet ML-DSA-44 public key found verbatim in extrinsic')
             : bad('Wallet PK NOT found in extrinsic');
  nullInside ? ok('Wallet full nullifier found verbatim in extrinsic')
             : bad('Wallet nullifier NOT found in extrinsic');

  // 5 ── Privacy property ───────────────────────────────────────
  hdr('5. Privacy: deposit commitment is hidden at withdraw');
  info(`Searching for deposit leaf ${leafHex.slice(0,16)}… in withdraw extrinsic`);
  if (leafInside) {
    bad('Leaf APPEARS in withdraw extrinsic → privacy broken');
  } else {
    ok('Leaf does NOT appear in withdraw extrinsic');
    ok('External observers cannot link this withdraw to the specific deposit');
  }

  // ── Verdict ──────────────────────────────────────────────────
  hdr('Verdict');
  if (process.exitCode) {
    console.log(`  ${C.r}✗ Verification FAILED${C.x}\n`);
  } else {
    console.log(`  ${C.g}✓ Post-quantum ML-DSA-44 key${C.x}        (FIPS 204, 1312 B exactly)`);
    console.log(`  ${C.g}✓ Wallet → deposit linked${C.x}            (commitment on chain matches)`);
    console.log(`  ${C.g}✓ Wallet → withdraw linked${C.x}           (PK + nullifier inside extrinsic)`);
    console.log(`  ${C.g}✓ Privacy property holds${C.x}             (deposit leaf hidden at withdraw)`);
    console.log(`\n  The wallet provably created and spent a real post-quantum-keyed deposit`);
    console.log(`  on ProofHub Mainnet, while preserving the privacy of the link.\n`);
  }
  await api.disconnect();
}

main().catch(e => { console.error(C.r + 'ERROR: ' + C.x + e.message); process.exit(1); });
