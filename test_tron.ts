import { ethers } from "ethers";

// ── Base58Check Decoder ──
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(str: string): Uint8Array {
  let n = 0n;
  for (const c of str) { n = n * 58n + BigInt(B58.indexOf(c)); }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  const leading = str.match(/^1*/)?.[0].length || 0;
  return new Uint8Array([...new Array(leading).fill(0), ...bytes]);
}
function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2,'0')).join('');
}
function toTronHex(base58Address: string): string {
  const bytes = base58Decode(base58Address);
  return bytesToHex(bytes.slice(0, 21)); // Remove the 4-byte checksum
}

async function run() {
    const TRON_RELAYER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const wallet = new ethers.Wallet(TRON_RELAYER_KEY);
    const ownerHex = "41" + wallet.address.slice(2).toLowerCase();
    const toHex = toTronHex("TWibd4sjko8MwQmdZA2AGyia4W8hzbqNXc").toLowerCase();
    console.log("Owner:", ownerHex, "To:", toHex);
}
run();
