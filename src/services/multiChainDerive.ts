// ============================================================
// multiChainDerive.ts — BIP-39 니모닉 → 멀티체인 주소 파생
//
// EVM  m/44'/60'/0'/0/0  — ethers v6
// SOL  m/44'/501'/0'/0'  — SLIP-0010 + @noble/ed25519
// TRX  m/44'/195'/0'/0/0 — Tron Base58Check
// BTC  m/44'/0'/0'/0/0   — P2PKH Base58Check
//
// 의존성: ethers, @noble/ed25519
// @noble/hashes 불필요 — HMAC-SHA512는 Web Crypto로 처리
// ============================================================

import { ethers } from 'ethers';
// @ts-ignore
import { getPublicKeyAsync } from '@noble/ed25519';

// ── 타입 캐스팅 헬퍼 ─────────────────────────────────────────
function asBS(buf: Uint8Array): BufferSource {
  return buf as unknown as BufferSource;
}

export interface MultiChainAddresses {
  evm: string;
  sol?: string;
  trx?: string;
  btc?: string;
}

// ── Web Crypto HMAC-SHA512 ───────────────────────────────────
// @noble/hashes 대신 브라우저 내장 Web Crypto 사용
async function hmacSha512(key: Uint8Array, ...msgs: Uint8Array[]): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw', asBS(key),
    { name: 'HMAC', hash: 'SHA-512' },
    false, ['sign']
  );
  const totalLen = msgs.reduce((s, m) => s + m.length, 0);
  const data = new Uint8Array(totalLen);
  let off = 0;
  for (const m of msgs) { data.set(m, off); off += m.length; }
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, asBS(data)));
}

// ── Base58 ───────────────────────────────────────────────────
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buf: Uint8Array): string {
  let n = BigInt(0);
  for (const b of buf) n = n * 256n + BigInt(b);
  let str = '';
  while (n > 0n) { str = B58[Number(n % 58n)] + str; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; str = '1' + str; }
  return str;
}

async function base58CheckEncode(payload: Uint8Array): Promise<string> {
  const h1 = new Uint8Array(await crypto.subtle.digest('SHA-256', asBS(payload)));
  const h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', asBS(h1)));
  const full = new Uint8Array(payload.length + 4);
  full.set(payload); full.set(h2.slice(0, 4), payload.length);
  return base58Encode(full);
}

// ── RIPEMD-160 (순수 JS) ─────────────────────────────────────
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
  dv.setUint32(msg.length-8,(len*8)>>>0,true);
  dv.setUint32(msg.length-4,Math.floor(len*8/2**32),true);
  let h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476,h4=0xC3D2E1F0;
  for(let i=0;i<msg.length;i+=64){
    const X=Array.from({length:16},(_,j)=>dv.getUint32(i+j*4,true));
    let[al,bl,cl,dl,el]=[h0,h1,h2,h3,h4];
    let[ar,br,cr,dr,er]=[h0,h1,h2,h3,h4];
    for(let j=0;j<80;j++){
      const r=Math.floor(j/16);
      let T=add(al,f(j,bl,cl,dl),X[RL[j]],KL[r]);T=add(rol(T,SL[j]),el);[al,bl,cl,dl,el]=[el,T,bl,rol(cl,10),dl];
      T=add(ar,f(79-j,br,cr,dr),X[RR[j]],KR[r]);T=add(rol(T,SR[j]),er);[ar,br,cr,dr,er]=[er,T,br,rol(cr,10),dr];
    }
    const T=add(h1,cl,dr);h1=add(h2,dl,er);h2=add(h3,el,ar);h3=add(h4,al,br);h4=add(h0,bl,cr);h0=T;
  }
  const out=new Uint8Array(20);
  const odv=new DataView(out.buffer);
  [h0,h1,h2,h3,h4].forEach((v,i)=>odv.setUint32(i*4,v,true));
  return out;
}

// ── SLIP-0010 (async) ────────────────────────────────────────
async function slip10Derive(seed: Uint8Array, path: number[]): Promise<Uint8Array> {
  const masterKey = new TextEncoder().encode('ed25519 seed');
  let I = await hmacSha512(masterKey, seed);
  let kL = I.slice(0, 32), kR = I.slice(32);
  for (const idx of path) {
    const d = new Uint8Array(37);
    d[0] = 0x00; d.set(kL, 1);
    d[33] = (idx >>> 24) & 0xff; d[34] = (idx >>> 16) & 0xff;
    d[35] = (idx >>> 8) & 0xff;  d[36] = idx & 0xff;
    I = await hmacSha512(kR, d);
    kL = I.slice(0, 32); kR = I.slice(32);
  }
  return kL;
}

// ── HD root ──────────────────────────────────────────────────
function getRoot(mnemonic: string): ethers.HDNodeWallet {
  return ethers.HDNodeWallet.fromSeed(
    ethers.Mnemonic.fromPhrase(mnemonic).computeSeed()
  );
}

// ── EVM ──────────────────────────────────────────────────────
function deriveEVM(mnemonic: string): string {
  const child = getRoot(mnemonic).derivePath("m/44'/60'/0'/0/0");
  return new ethers.Wallet(child.privateKey).address;
}

// ── SOL ──────────────────────────────────────────────────────
async function deriveSOL(mnemonic: string): Promise<string> {
  try {
    const seed    = ethers.getBytes(ethers.Mnemonic.fromPhrase(mnemonic).computeSeed());
    const privKey = await slip10Derive(seed, [0x8000002c, 0x800001f5, 0x80000000, 0x80000000]);
    const pubKey  = await (getPublicKeyAsync as (priv: Uint8Array) => Promise<Uint8Array>)(privKey);
    return base58Encode(pubKey);
  } catch { return ''; }
}

// ── TRX ──────────────────────────────────────────────────────
async function deriveTRX(mnemonic: string): Promise<string> {
  try {
    const child   = getRoot(mnemonic).derivePath("m/44'/195'/0'/0/0");
    const evmAddr = new ethers.Wallet(child.privateKey).address;
    const payload = new Uint8Array(21);
    payload[0] = 0x41; payload.set(ethers.getBytes(evmAddr), 1);
    return await base58CheckEncode(payload);
  } catch { return ''; }
}

// ── BTC ──────────────────────────────────────────────────────
async function deriveBTC(mnemonic: string): Promise<string> {
  try {
    const child   = getRoot(mnemonic).derivePath("m/44'/0'/0'/0/0");
    const sigKey  = new ethers.SigningKey(child.privateKey);
    const compPub = ethers.getBytes(sigKey.compressedPublicKey);
    const sha256  = new Uint8Array(await crypto.subtle.digest('SHA-256', asBS(compPub)));
    const hash160 = ripemd160(sha256);
    const payload = new Uint8Array(21);
    payload[0] = 0x00; payload.set(hash160, 1);
    return await base58CheckEncode(payload);
  } catch { return ''; }
}

// ── 메인 export ──────────────────────────────────────────────
export async function deriveMultiChainAddresses(
  mnemonic: string,
): Promise<MultiChainAddresses> {
  const [evm, sol, trx, btc] = await Promise.all([
    Promise.resolve(deriveEVM(mnemonic)),
    deriveSOL(mnemonic),
    deriveTRX(mnemonic),
    deriveBTC(mnemonic),
  ]);
  return {
    evm,
    sol: sol || undefined,
    trx: trx || undefined,
    btc: btc || undefined,
  };
}