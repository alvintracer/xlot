import { ethers } from "ethers";

const privateKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const wallet = new ethers.Wallet(privateKey);
console.log("EVM:", wallet.address.toLowerCase());
console.log("TronHex:", "41" + wallet.address.slice(2).toLowerCase());

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
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

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.slice(i*2,i*2+2),16);
  return a;
}

async function test() {
    const tronHex = "41" + wallet.address.slice(2).toLowerCase();
    const b58 = await base58CheckEncode(hexToBytes(tronHex));
    console.log("Base58:", b58);
}
test();
