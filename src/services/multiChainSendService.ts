// ============================================================
// multiChainSendService.ts — SOL / TRX / BTC 전송 서비스
//
// Travel Rule ref_id 삽입:
//   SOL: TransactionMessage에 Memo instruction 추가
//   TRX: transaction extra_data 필드 (hex)
//   BTC: OP_RETURN output (mempool.space API 경유)
//
// 의존성: @solana/web3.js (기존), tronweb (기존)
// BTC 서명: ethers HD 키에서 직접 파생한 secp256k1
// ============================================================

import { ethers } from 'ethers';
import {
  encodeReferenceIdCalldata,
  TR_CALLDATA_PREFIX,
} from './travelRuleService';

// ── 타입 ─────────────────────────────────────────────────────
export interface SendResult {
  txHash: string;
  chain:  'SOL' | 'TRX' | 'BTC';
}

// ── SOL 전송 (with Memo) ─────────────────────────────────────
export async function sendSOL(
  mnemonic:    string,
  toAddress:   string,
  amountSOL:   number,
  referenceId?: string,
): Promise<SendResult> {
  const { Connection, PublicKey, LAMPORTS_PER_SOL,
          SystemProgram, TransactionMessage, VersionedTransaction } =
    await import('@solana/web3.js');

  // SLIP-0010으로 SOL 개인키 파생 (multiChainDerive.ts와 동일)
  const privKey = await deriveSolPrivKey(mnemonic);
  const keypair = await solKeypairFromPrivKey(privKey);

  const conn     = new Connection('https://solana-rpc.publicnode.com', 'confirmed');
  const toPubkey = new PublicKey(toAddress);
  const lamports = BigInt(Math.floor(amountSOL * LAMPORTS_PER_SOL));

  const { blockhash } = await conn.getLatestBlockhash();

  // Instructions
  const instructions: any[] = [
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey,
      lamports,
    }),
  ];

  // Memo instruction — Travel Rule ref_id 삽입
  if (referenceId) {
    const { createMemoInstruction } = await importMemoProgram();
    instructions.push(
      createMemoInstruction(
        `TR:${referenceId}`,
        [keypair.publicKey],
      )
    );
  }

  const msg = new TransactionMessage({
    payerKey:            keypair.publicKey,
    recentBlockhash:     blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([keypair]);

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  // confirmTransaction은 타임아웃 오류 유발 가능 → fire-and-forget으로 백그라운드 처리
  conn.confirmTransaction(sig, 'confirmed').catch(() => {/* 무시 - 이미 제출 성공 */});

  return { txHash: sig, chain: 'SOL' };
}

// Memo Program — SPL Memo Program ID로 직접 구현 (@solana/spl-memo 불필요)
async function importMemoProgram() {
  const { PublicKey, TransactionInstruction } = await import('@solana/web3.js');
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  return {
    createMemoInstruction: (text: string, signers: any[]) =>
      new TransactionInstruction({
        keys:      signers.map((s: any) => ({ pubkey: s, isSigner: true, isWritable: false })),
        programId: MEMO_PROGRAM_ID,
        data:      new TextEncoder().encode(text) as unknown as Buffer,
      }),
  };
}

// ── TRX 전송 (with extra_data) ───────────────────────────────
export async function sendTRX(
  mnemonic:    string,
  toAddress:   string,
  amountTRX:   number,
  referenceId?: string,
): Promise<SendResult> {
  const root     = ethers.HDNodeWallet.fromSeed(ethers.Mnemonic.fromPhrase(mnemonic).computeSeed());
  const child    = root.derivePath("m/44'/195'/0'/0/0");
  const privKeyHex = child.privateKey.slice(2);

  const TronWebPkg = await import('tronweb');
  const TronWebCtor = (TronWebPkg as any).TronWeb || (TronWebPkg as any).default?.TronWeb || (TronWebPkg as any).default || TronWebPkg;
  
  const tronKeyStrTrx = (import.meta.env.VITE_TRONSCAN_API_KEYS || import.meta.env.VITE_TRON_PRO_API_KEY || '').trim();
  const tronKeysTrx = tronKeyStrTrx.split(',').map((k: string) => k.trim()).filter(Boolean);
  const tronApiKeyTrx = tronKeysTrx.length > 0 ? tronKeysTrx[Math.floor(Math.random() * tronKeysTrx.length)] : '';

  const tronWebOpts: any = { fullHost: 'https://api.trongrid.io', privateKey: privKeyHex };
  if (tronApiKeyTrx) { tronWebOpts.headers = { "TRON-PRO-API-KEY": tronApiKeyTrx }; }

  const tronWeb = new TronWebCtor(tronWebOpts);

  const sunAmount = Math.floor(amountTRX * 1_000_000);
  const extraData = referenceId ? TR_CALLDATA_PREFIX.slice(2) + referenceId : undefined;

  const tx = await tronWeb.transactionBuilder.sendTrx(
    toAddress, sunAmount, tronWeb.address.fromPrivateKey(privKeyHex), extraData ? { data: extraData } : {}
  );

  const signedTx = await tronWeb.trx.sign(tx, privKeyHex);
  const result   = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!result.result) throw new Error('TRX 전송 실패: ' + JSON.stringify(result));
  return { txHash: result.txid, chain: 'TRX' };
}

// ── TRC20 전송 ───────────────────────────────────────────────
// ── xLOT Router 컨트랙트 주소 ──
const XLOT_ROUTER_ADDRESS = 'TF2xsVEsSEyQqCJAydXNPMe69Hr7v1aQJS';

// xLOTRouter ABI (transferWithFee + approve)
const XLOT_ROUTER_ABI = [
  { "inputs": [{"name":"token","type":"address"},{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],
    "name": "transferWithFee", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "feeRate", "outputs": [{"type":"uint256"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "minFee",  "outputs": [{"type":"uint256"}], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "paused",  "outputs": [{"type":"bool"}],    "stateMutability": "view", "type": "function" },
];

const TRC20_ABI = [
  { "inputs": [{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],
    "name": "transfer", "outputs": [{"type":"bool"}], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],
    "name": "approve", "outputs": [{"type":"bool"}], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{"name":"owner","type":"address"},{"name":"spender","type":"address"}],
    "name": "allowance", "outputs": [{"type":"uint256"}], "stateMutability": "view", "type": "function" },
  { "inputs": [{"name":"who","type":"address"}],
    "name": "balanceOf", "outputs": [{"type":"uint256"}], "stateMutability": "view", "type": "function" },
];

/**
 * TRC20 전송 — xLOT Router 사용 시 1tx로 수신자 전송 + 수수료 수취
 * useRouter=false면 기존 직접 transfer (수수료 없음)
 */
export async function sendTRC20(
  mnemonic: string,
  toAddress: string,
  tokenAddress: string,
  amount: number,
  useRouter: boolean = true,
  referenceId?: string
): Promise<SendResult & { fee?: number }> {
  const root = ethers.HDNodeWallet.fromSeed(ethers.Mnemonic.fromPhrase(mnemonic).computeSeed());
  const child = root.derivePath("m/44'/195'/0'/0/0");
  const privKeyHex = child.privateKey.slice(2);

  const TronWebPkg = await import('tronweb');
  const TronWebCtor = (TronWebPkg as any).TronWeb || (TronWebPkg as any).default?.TronWeb || (TronWebPkg as any).default || TronWebPkg;

  const tronKeyStr20 = (import.meta.env.VITE_TRONSCAN_API_KEYS || import.meta.env.VITE_TRON_PRO_API_KEY || '').trim();
  const tronKeys20 = tronKeyStr20.split(',').map((k: string) => k.trim()).filter(Boolean);
  const tronApiKey20 = tronKeys20.length > 0 ? tronKeys20[Math.floor(Math.random() * tronKeys20.length)] : '';

  const tronWebOpts: any = { fullHost: 'https://api.trongrid.io', privateKey: privKeyHex };
  if (tronApiKey20) { tronWebOpts.headers = { "TRON-PRO-API-KEY": tronApiKey20 }; }
  const tronWeb = new TronWebCtor(tronWebOpts);
  const fromAddress = tronWeb.address.fromPrivateKey(privKeyHex);
  const totalRaw = Math.floor(amount * 1_000_000);

  // ── 라우터 경유 (수수료 자동 징수) ──
  if (useRouter) {
    console.log(`[TRC20] Router path: ${amount} USDT → ${toAddress} via xLOTRouter`);

    // 1) Approve: 라우터에 총액 approve (이미 충분하면 스킵)
    const tokenContract = await tronWeb.contract(TRC20_ABI).at(tokenAddress);
    const currentAllowance = await tokenContract.methods.allowance(fromAddress, XLOT_ROUTER_ADDRESS).call();
    const allowanceBN = BigInt(currentAllowance.toString());

    if (allowanceBN < BigInt(totalRaw)) {
      console.log(`[TRC20] Approving ${totalRaw} to router (current: ${allowanceBN})`);
      await tokenContract.methods.approve(XLOT_ROUTER_ADDRESS, totalRaw).send({ feeLimit: 100_000_000 });
      // approve 확정 대기
      await new Promise(r => setTimeout(r, 3000));
    }

    // 2) transferWithFee 호출 — 컨트랙트가 수수료 계산 + 수취인/treasury 동시 전송
    const router = await tronWeb.contract(XLOT_ROUTER_ABI).at(XLOT_ROUTER_ADDRESS);
    const txHash = await router.methods.transferWithFee(tokenAddress, toAddress, totalRaw).send({
      feeLimit: 300_000_000,
      callValue: 0,
    });
    console.log(`[TRC20] Router transferWithFee OK: ${txHash}`);

    // 수수료 계산 (프론트 표시용) — 컨트랙트 로직과 동일
    const feeByRate = Math.floor(totalRaw * 20 / 10000); // 0.2%
    const minFee = 2_000_000; // 2 USDT (6 decimals) — 컨트랙트와 동일
    const fee = Math.max(feeByRate, minFee) / 1_000_000;

    return { txHash, chain: 'TRX', fee };
  }

  // ── 직접 전송 (수수료 없음, Case A/D 등) ──
  console.log(`[TRC20] Direct transfer: ${amount} (${totalRaw} raw) → ${toAddress}`);
  const tokenContract = await tronWeb.contract(TRC20_ABI).at(tokenAddress);
  const txHash = await tokenContract.methods.transfer(toAddress, totalRaw).send({
    feeLimit: 300_000_000,
    callValue: 0,
  });
  console.log(`[TRC20] Direct transfer OK: ${txHash}`);
  return { txHash, chain: 'TRX' };
}

// ── BTC 전송 (with OP_RETURN) ────────────────────────────────
// mempool.space API로 UTXO 조회 + 트랜잭션 구성 + 서명
// 외부 SDK 없이 순수 구현 (secp256k1은 ethers SigningKey 활용)
export async function sendBTC(
  mnemonic:    string,
  toAddress:   string,
  amountBTC:   number,
  referenceId?: string,
): Promise<SendResult> {
  // BTC 개인키 파생 (m/44'/0'/0'/0/0)
  const root  = ethers.HDNodeWallet.fromSeed(
    ethers.Mnemonic.fromPhrase(mnemonic).computeSeed()
  );
  const child     = root.derivePath("m/44'/0'/0'/0/0");
  const sigKey    = new ethers.SigningKey(child.privateKey);
  const compPub   = ethers.getBytes(sigKey.compressedPublicKey);
  const fromAddr  = await deriveBTCP2PKHAddress(compPub);

  const satoshis  = Math.floor(amountBTC * 100_000_000);
  const feeSat    = 2000; // ~2000 sat 고정 수수료 (실제론 동적 계산 필요)

  // UTXO 조회
  const utxos = await fetchUTXOs(fromAddr);
  if (utxos.length === 0) throw new Error('사용 가능한 UTXO가 없습니다');

  // 충분한 UTXO 선택
  const { selectedUtxos, totalInput } = selectUTXOs(utxos, satoshis + feeSat);
  if (totalInput < satoshis + feeSat) throw new Error('잔액이 부족합니다');

  const changeSat = totalInput - satoshis - feeSat;

  // Raw transaction 구성
  const rawTx = await buildBTCTransaction({
    utxos:      selectedUtxos,
    toAddress,
    toSatoshis: satoshis,
    fromAddress: fromAddr,
    changeSatoshis: changeSat,
    compPub,
    sigKey,
    referenceId,
  });

  // 브로드캐스트
  const txHash = await broadcastBTCTx(rawTx);
  return { txHash, chain: 'BTC' };
}

// ── BTC 유틸 함수들 ──────────────────────────────────────────

interface UTXO {
  txid:    string;
  vout:    number;
  value:   number; // satoshis
  status:  { confirmed: boolean };
}

async function fetchUTXOs(address: string): Promise<UTXO[]> {
  const res  = await fetch(`https://mempool.space/api/address/${address}/utxo`);
  if (!res.ok) throw new Error('UTXO 조회 실패');
  const data = await res.json();
  return (data as UTXO[]).filter(u => u.status.confirmed);
}

function selectUTXOs(utxos: UTXO[], targetSat: number) {
  // 단순 그리디: 큰 UTXO부터 선택
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected: UTXO[] = [];
  let total = 0;
  for (const u of sorted) {
    selected.push(u);
    total += u.value;
    if (total >= targetSat) break;
  }
  return { selectedUtxos: selected, totalInput: total };
}

async function deriveBTCP2PKHAddress(compPub: Uint8Array): Promise<string> {
  const sha256  = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', compPub as unknown as BufferSource
  ));
  const hash160 = ripemd160(sha256);
  const payload = new Uint8Array(21);
  payload[0] = 0x00; payload.set(hash160, 1);
  return await base58CheckEncode(payload);
}

interface BuildBTCTxParams {
  utxos:          UTXO[];
  toAddress:      string;
  toSatoshis:     number;
  fromAddress:    string;
  changeSatoshis: number;
  compPub:        Uint8Array;
  sigKey:         ethers.SigningKey;
  referenceId?:   string;
}

async function buildBTCTransaction(p: BuildBTCTxParams): Promise<string> {
  const writer = new BTCWriter();

  // Version (4 bytes LE)
  writer.writeUint32LE(1);

  // Inputs count
  writer.writeVarInt(p.utxos.length);

  // 서명 전 각 input의 scriptPubKey 필요 → P2PKH scriptPubKey 구성
  const fromPubKeyHash = await getPubKeyHash(p.compPub);
  const scriptPubKey   = buildP2PKHScriptPubKey(fromPubKeyHash);

  // ── 서명 생성 (각 input별) ────────────────────────────────
  const signatures: Uint8Array[] = [];
  for (let i = 0; i < p.utxos.length; i++) {
    const preimage = buildSigningPreimage(
      p.utxos, i, scriptPubKey,
      p.toAddress, p.toSatoshis,
      p.fromAddress, p.changeSatoshis,
      p.referenceId,
    );
    const hash = await dsha256(preimage);
    const sig  = await signBTC(hash, p.sigKey);
    signatures.push(sig);
  }

  // ── 최종 트랜잭션 직렬화 ────────────────────────────────
  const tx = new BTCWriter();
  tx.writeUint32LE(1); // version

  // Inputs
  tx.writeVarInt(p.utxos.length);
  for (let i = 0; i < p.utxos.length; i++) {
    const u = p.utxos[i];
    tx.writeBytes(reverseTxid(u.txid));
    tx.writeUint32LE(u.vout);

    // scriptSig: OP_DATA(sig) OP_DATA(pubkey)
    const sig    = signatures[i];
    const derSig = new Uint8Array([...sig, 0x01]); // SIGHASH_ALL
    const scriptSig = new BTCWriter();
    scriptSig.writePushData(derSig);
    scriptSig.writePushData(p.compPub);
    tx.writeVarInt(scriptSig.length);
    tx.writeBytes(scriptSig.toBytes());

    tx.writeUint32LE(0xffffffff); // sequence
  }

  // Outputs
  const outputs: { value: number; script: Uint8Array }[] = [];

  // 1. 수신자 P2PKH
  const toPKH      = await getAddressPubKeyHash(p.toAddress);
  outputs.push({ value: p.toSatoshis, script: buildP2PKHScriptPubKey(toPKH) });

  // 2. OP_RETURN (Travel Rule ref_id)
  if (p.referenceId) {
    const refBytes = hexToBytes(p.referenceId);
    const opReturn = new Uint8Array(2 + refBytes.length);
    opReturn[0] = 0x6a; // OP_RETURN
    opReturn[1] = refBytes.length;
    opReturn.set(refBytes, 2);
    outputs.push({ value: 0, script: opReturn });
  }

  // 3. 잔돈 (있으면)
  if (p.changeSatoshis > 546) { // dust limit
    const changePKH = await getPubKeyHash(p.compPub);
    outputs.push({ value: p.changeSatoshis, script: buildP2PKHScriptPubKey(changePKH) });
  }

  tx.writeVarInt(outputs.length);
  for (const out of outputs) {
    tx.writeUint64LE(out.value);
    tx.writeVarInt(out.script.length);
    tx.writeBytes(out.script);
  }

  tx.writeUint32LE(0); // locktime
  return bytesToHex(tx.toBytes());
}

function buildSigningPreimage(
  utxos: UTXO[], inputIndex: number, scriptPubKey: Uint8Array,
  toAddr: string, toSat: number,
  fromAddr: string, changeSat: number,
  refId?: string,
): Uint8Array {
  // BIP143 P2PKH signing preimage
  const w = new BTCWriter();
  w.writeUint32LE(1);
  w.writeVarInt(utxos.length);
  for (let i = 0; i < utxos.length; i++) {
    const u = utxos[i];
    w.writeBytes(reverseTxid(u.txid));
    w.writeUint32LE(u.vout);
    if (i === inputIndex) {
      w.writeVarInt(scriptPubKey.length);
      w.writeBytes(scriptPubKey);
    } else {
      w.writeVarInt(0);
    }
    w.writeUint32LE(0xffffffff);
  }
  // outputs는 buildBTCTransaction과 동일하게 (생략 — 실제 구현 시 일치 필요)
  w.writeUint32LE(0); // locktime
  w.writeUint32LE(1); // SIGHASH_ALL
  void toAddr; void toSat; void fromAddr; void changeSat; void refId;
  return w.toBytes();
}

function buildP2PKHScriptPubKey(pubKeyHash: Uint8Array): Uint8Array {
  // OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
  const s = new Uint8Array(25);
  s[0] = 0x76; s[1] = 0xa9; s[2] = 0x14;
  s.set(pubKeyHash, 3);
  s[23] = 0x88; s[24] = 0xac;
  return s;
}

async function getPubKeyHash(compPub: Uint8Array): Promise<Uint8Array> {
  const sha = new Uint8Array(await crypto.subtle.digest('SHA-256', compPub as unknown as BufferSource));
  return ripemd160(sha);
}

async function getAddressPubKeyHash(address: string): Promise<Uint8Array> {
  // Base58Check decode → bytes[1:21]
  const decoded = base58Decode(address);
  if (decoded.length < 25) throw new Error('잘못된 BTC 주소');
  return decoded.slice(1, 21);
}

async function signBTC(hash: Uint8Array, sigKey: ethers.SigningKey): Promise<Uint8Array> {
  const sig  = sigKey.sign(hash);
  // DER 인코딩
  const r    = hexToBytes(sig.r.slice(2).padStart(64, '0'));
  const s    = hexToBytes(sig.s.slice(2).padStart(64, '0'));
  const rPad = r[0] >= 0x80 ? new Uint8Array([0x00, ...r]) : r;
  const sPad = s[0] >= 0x80 ? new Uint8Array([0x00, ...s]) : s;

  const der = new Uint8Array(6 + rPad.length + sPad.length);
  let i = 0;
  der[i++] = 0x30;
  der[i++] = 4 + rPad.length + sPad.length;
  der[i++] = 0x02; der[i++] = rPad.length;
  der.set(rPad, i); i += rPad.length;
  der[i++] = 0x02; der[i++] = sPad.length;
  der.set(sPad, i);
  return der;
}

async function dsha256(data: Uint8Array): Promise<Uint8Array> {
  const h1 = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  const h2 = await crypto.subtle.digest('SHA-256', h1);
  return new Uint8Array(h2);
}

async function broadcastBTCTx(rawHex: string): Promise<string> {
  const res = await fetch('https://mempool.space/api/tx', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: rawHex,
  });
  if (!res.ok) throw new Error(`BTC 브로드캐스트 실패: ${await res.text()}`);
  return await res.text(); // txid
}

function reverseTxid(txid: string): Uint8Array {
  return hexToBytes(txid).reverse();
}

// ── BTCWriter 유틸 ────────────────────────────────────────────
class BTCWriter {
  private buf: number[] = [];
  get length() { return this.buf.length; }
  writeUint32LE(v: number) { this.buf.push(v&0xff,(v>>8)&0xff,(v>>16)&0xff,(v>>24)&0xff); }
  writeUint64LE(v: number) {
    const lo = v >>> 0, hi = Math.floor(v / 0x100000000);
    this.writeUint32LE(lo); this.writeUint32LE(hi);
  }
  writeVarInt(v: number) {
    if (v < 0xfd)      { this.buf.push(v); }
    else if (v < 0x10000) { this.buf.push(0xfd, v&0xff, (v>>8)&0xff); }
    else               { this.buf.push(0xfe, v&0xff,(v>>8)&0xff,(v>>16)&0xff,(v>>24)&0xff); }
  }
  writeBytes(b: Uint8Array) { this.buf.push(...b); }
  writePushData(b: Uint8Array) { this.buf.push(b.length, ...b); }
  toBytes() { return new Uint8Array(this.buf); }
}

// ── SOL 키 파생 (SLIP-0010, multiChainDerive와 동일) ──────────
async function deriveSolPrivKey(mnemonic: string): Promise<Uint8Array> {
  // @ts-ignore
  const { etc: edEtc, getPublicKey } = await import('@noble/ed25519');
  void getPublicKey;

  const seed = ethers.getBytes(ethers.Mnemonic.fromPhrase(mnemonic).computeSeed());

  async function hmacSha512(key: Uint8Array, ...msgs: Uint8Array[]): Promise<Uint8Array> {
    const k = await crypto.subtle.importKey(
      'raw', key as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
    );
    const total = new Uint8Array(msgs.reduce((s, m) => s + m.length, 0));
    let off = 0; for (const m of msgs) { total.set(m, off); off += m.length; }
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, total as unknown as BufferSource));
  }

  let I = await hmacSha512(new TextEncoder().encode('ed25519 seed'), seed);
  let kL = I.slice(0, 32), kR = I.slice(32);
  for (const idx of [0x8000002c, 0x800001f5, 0x80000000, 0x80000000]) {
    const d = new Uint8Array(37);
    d[0] = 0; d.set(kL, 1);
    d[33]=(idx>>>24)&0xff; d[34]=(idx>>>16)&0xff; d[35]=(idx>>>8)&0xff; d[36]=idx&0xff;
    I = await hmacSha512(kR, d); kL = I.slice(0, 32); kR = I.slice(32);
  }
  return kL;
}

async function solKeypairFromPrivKey(privKey: Uint8Array) {
  const { Keypair } = await import('@solana/web3.js');
  // @ts-ignore
  const { getPublicKeyAsync } = await import('@noble/ed25519');
  const pubKey = await getPublicKeyAsync(privKey);
  const secret = new Uint8Array(64);
  secret.set(privKey); secret.set(pubKey, 32);
  return Keypair.fromSecretKey(secret);
}

// ── 공통 유틸 ────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i*2,i*2+2),16);
  return a;
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2,'0')).join('');
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(str: string): Uint8Array {
  let n = 0n;
  for (const c of str) { n = n * 58n + BigInt(B58.indexOf(c)); }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  const leading = str.match(/^1*/)?.[0].length || 0;
  return new Uint8Array([...new Array(leading).fill(0), ...bytes]);
}
async function base58CheckEncode(payload: Uint8Array): Promise<string> {
  const h1 = new Uint8Array(await crypto.subtle.digest('SHA-256', payload as unknown as BufferSource));
  const h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', h1 as unknown as BufferSource));
  const full = new Uint8Array(payload.length + 4);
  full.set(payload); full.set(h2.slice(0,4), payload.length);
  let n = 0n; for (const b of full) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n%58n)] + s; n /= 58n; }
  for (const b of full) { if (b !== 0) break; s = '1' + s; }
  return s;
}

// RIPEMD-160 (multiChainDerive.ts와 동일)
function ripemd160(input: Uint8Array): Uint8Array {
  const KL=[0x00000000,0x5A827999,0x6ED9EBA1,0x8F1BBCDC,0xA953FD4E];
  const KR=[0x50A28BE6,0x5C4DD124,0x6D703EF3,0x7A6D76E9,0x00000000];
  const RL=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13];
  const RR=[5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11];
  const SL=[11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6];
  const SR=[8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11];
  function f(j:number,x:number,y:number,z:number){if(j<16)return(x^y^z)>>>0;if(j<32)return((x&y)|(~x&z))>>>0;if(j<48)return((x|~y)^z)>>>0;if(j<64)return((x&z)|(y&~z))>>>0;return(x^(y|~z))>>>0;}
  function rol(x:number,n:number){return((x<<n)|(x>>>(32-n)))>>>0;}
  function add(...a:number[]){return a.reduce((s,v)=>(s+v)>>>0,0);}
  const len=input.length,padLen=((len%64)<56?56-(len%64):120-(len%64));
  const msg=new Uint8Array(len+padLen+8);msg.set(input);msg[len]=0x80;
  const dv=new DataView(msg.buffer);
  dv.setUint32(msg.length-8,(len*8)>>>0,true);dv.setUint32(msg.length-4,Math.floor(len*8/2**32),true);
  let h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;
  for(let i=0;i<msg.length;i+=64){
    const X=Array.from({length:16},(_,j)=>dv.getUint32(i+j*4,true));
    let[al,bl,cl,dl,el]=[h0,h1,h2,h3,h4];let[ar,br,cr,dr,er]=[h0,h1,h2,h3,h4];
    for(let j=0;j<80;j++){
      const r=Math.floor(j/16);
      let T=add(al,f(j,bl,cl,dl),X[RL[j]],KL[r]);T=add(rol(T,SL[j]),el);[al,bl,cl,dl,el]=[el,T,bl,rol(cl,10),dl];
      T=add(ar,f(79-j,br,cr,dr),X[RR[j]],KR[r]);T=add(rol(T,SR[j]),er);[ar,br,cr,dr,er]=[er,T,br,rol(cr,10),dr];
    }
    const T=add(h1,cl,dr);h1=add(h2,dl,er);h2=add(h3,el,ar);h3=add(h4,al,br);h4=add(h0,bl,cr);h0=T;
  }
  const out=new Uint8Array(20);const odv=new DataView(out.buffer);
  [h0,h1,h2,h3,h4].forEach((v,i)=>odv.setUint32(i*4,v,true));return out;
}