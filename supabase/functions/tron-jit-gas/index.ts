import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ethers } from "npm:ethers@6.11.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function sendRawTrx(wallet: ethers.Wallet, fromHex: string, toHex: string, amountTrx: number) {
    const sunAmount = Math.floor(amountTrx * 1_000_000);
    const createRes = await fetch("https://api.trongrid.io/wallet/createtransaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_address: toHex, owner_address: fromHex, amount: sunAmount })
    });
    
    const txObj = await createRes.json();
    if (txObj.Error) throw new Error("Create fallback/activation tx failed: " + txObj.Error);

    const sig = wallet.signingKey.sign("0x" + txObj.txID);
    let v = sig.v; if (v === 27) v = 0; if (v === 28) v = 1;
    const signatureHex = sig.r.slice(2) + sig.s.slice(2) + v.toString(16).padStart(2, '0');
    txObj.signature = [signatureHex];

    const broadcastRes = await fetch("https://api.trongrid.io/wallet/broadcasttransaction", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(txObj)
    });
    const broadcastData = await broadcastRes.json();
    if (!broadcastData.result) throw new Error("Broadcast failed: " + JSON.stringify(broadcastData));
    return txObj.txID;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { userAddress, trxAmount = 30 } = await req.json();
    if (!userAddress) throw new Error("Missing userAddress");

    const TRON_RELAYER_KEY = Deno.env.get("TRON_RELAYER_KEY");
    if (!TRON_RELAYER_KEY) {
      return new Response(JSON.stringify({ success: true, message: "No API KEY" }), { headers: corsHeaders });
    }

    const wallet = new ethers.Wallet(TRON_RELAYER_KEY);
    const ownerHex = "41" + wallet.address.slice(2).toLowerCase();
    const toHex = toTronHex(userAddress).toLowerCase();

    // 1. 활성화 상태 점검
    const accRes = await fetch(`https://api.trongrid.io/v1/accounts/${toHex}`);
    const accData = await accRes.json();
    const isActive = accData.data && accData.data.length > 0;
    
    // 수수료 회수(0.1 USDT) + 메인 전송 두 번의 컨트랙트 콜이 일어남 -> 총 ~97,000 에너지 필요
    const requiredEnergy = isActive ? 65000 : 100000; 

    // 에너지 임대 마켓 API 키
    const FEEE_IO_API_KEY = Deno.env.get("FEEE_IO_API_KEY");

    let activationTxId = null;
    let methodUsed = "none";
    let finalTxId = null;

    if (FEEE_IO_API_KEY) {
        // [임대 모델] API Key가 등록된 스마트 운영 모델
        methodUsed = "rental";
        if (!isActive) {
            console.log(`[Rental] Activating account ${userAddress} with 1.5 TRX...`);
            activationTxId = await sendRawTrx(wallet, ownerHex, toHex, 1.5);
            // 트론 활성화 전송 후 간격 확보
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`[Rental] Renting ${requiredEnergy} Energy via Feee.io to ${userAddress}...`);
        const rentRes = await fetch("https://api.feee.io/api/v1/order/create", {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": FEEE_IO_API_KEY },
            body: JSON.stringify({
                receive_address: userAddress,
                resource_type: 1, // 1=Energy
                amount: requiredEnergy,
                lock_time: 1 // 1 hour
            })
        });
        const rentData = await rentRes.json();
        return new Response(JSON.stringify({ success: true, method: methodUsed, activationTxId, rentData }), { headers: corsHeaders });
        
    } else {
        // [Fallback 모델] 쌩 펀딩 JIT
        methodUsed = "fallback_trx";
        // 2번의 전송(fee + destination)을 커버하려면 약 40~45 TRX가 필요
        const sendAmount = isActive ? 30 : 42; 
        console.log(`[Fallback] FEEE_IO_API_KEY missing. Fallback JIT sending ${sendAmount} TRX...`);
        
        finalTxId = await sendRawTrx(wallet, ownerHex, toHex, sendAmount);
        return new Response(JSON.stringify({ success: true, method: methodUsed, finalTxId }), { headers: corsHeaders });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 400 });
  }
});
