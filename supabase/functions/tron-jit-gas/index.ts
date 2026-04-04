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

async function sendRawTrx(wallet: ethers.Wallet, fromHex: string, toHex: string, amountTrx: number, tronApiKey?: string) {
    const sunAmount = Math.floor(amountTrx * 1_000_000);
    const tronHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (tronApiKey) tronHeaders["TRON-PRO-API-KEY"] = tronApiKey;

    const createRes = await fetch("https://api.trongrid.io/wallet/createtransaction", {
        method: "POST",
        headers: tronHeaders,
        body: JSON.stringify({ to_address: toHex, owner_address: fromHex, amount: sunAmount })
    });

    const txObjText = await createRes.text();
    let txObj: any;
    try { txObj = JSON.parse(txObjText); } catch (_) { throw new Error("TronGrid createtransaction returned non-JSON: " + txObjText.slice(0, 80)); }
    if (txObj.Error) throw new Error("Create tx failed: " + txObj.Error);

    const sig = wallet.signingKey.sign("0x" + txObj.txID);
    let v = sig.v; if (v === 27) v = 0; if (v === 28) v = 1;
    const signatureHex = sig.r.slice(2) + sig.s.slice(2) + v.toString(16).padStart(2, '0');
    txObj.signature = [signatureHex];

    const broadcastRes = await fetch("https://api.trongrid.io/wallet/broadcasttransaction", {
        method: "POST", headers: tronHeaders, body: JSON.stringify(txObj)
    });
    const broadcastText = await broadcastRes.text();
    let broadcastData: any;
    try { broadcastData = JSON.parse(broadcastText); } catch (_) { throw new Error("TronGrid broadcast returned non-JSON: " + broadcastText.slice(0, 80)); }
    if (!broadcastData.result) throw new Error("Broadcast failed: " + JSON.stringify(broadcastData));
    return txObj.txID;
}

// 릴레이어 TRX 잔액 조회 (sun 단위 반환) — hex 주소로 wallet/getaccount 사용
async function getRelayerBalanceSun(ownerHex: string): Promise<number> {
    try {
        const res = await fetch("https://api.trongrid.io/wallet/getaccount", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: ownerHex })
        });
        const text = await res.text();
        const data = JSON.parse(text);
        if (typeof data?.balance === 'number') return data.balance;
    } catch (_) { /* ignore */ }
    return 0;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // v4 — body 텍스트 수동 파싱
    const bodyText = await req.text();
    console.log(`[JIT-v4] Raw body (${bodyText.length}): "${bodyText.slice(0, 300)}"`);

    // JSON 시작 위치 찾기 (null 등 prefix 대비 방어 로직)
    const jsonStart = bodyText.search(/[\[{]/);
    const cleanBody = jsonStart > 0 ? bodyText.slice(jsonStart) : bodyText;

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleanBody);
    } catch (parseErr: any) {
      return new Response(
        JSON.stringify({ version: "v4", error: "Invalid JSON body", detail: parseErr.message, received: bodyText.slice(0, 120) }),
        { headers: corsHeaders, status: 400 }
      );
    }

    const userAddress: string = parsed.userAddress || parsed.user_address || '';
    if (!userAddress) throw new Error("Missing userAddress");

    // TRON API 키 로테이션 (쉼표 구분 다중 키 지원)
    const tronApiKeyStr = Deno.env.get("TRON_PRO_API_KEY") || Deno.env.get("TRON_API_KEY") || '';
    const tronApiKeys = tronApiKeyStr.split(',').map(k => k.trim()).filter(Boolean);
    const tronApiKey = tronApiKeys.length > 0 ? tronApiKeys[Math.floor(Math.random() * tronApiKeys.length)] : undefined;

    const TRON_RELAYER_KEY = Deno.env.get("TRON_RELAYER_KEY");
    if (!TRON_RELAYER_KEY) {
      return new Response(JSON.stringify({ success: true, message: "No relayer key configured" }), { headers: corsHeaders });
    }

    const wallet = new ethers.Wallet(TRON_RELAYER_KEY);
    const ownerHex = "41" + wallet.address.slice(2).toLowerCase();
    const toHex = toTronHex(userAddress).toLowerCase();

    // 1. 대상 계정 활성화 여부 + 현재 에너지 보유량 확인
    let isActive = false;
    let hasEnergy = false;
    let userTrxBalance = 0;
    try {
        const accHeaders: Record<string, string> = {};
        if (tronApiKey) accHeaders['TRON-PRO-API-KEY'] = tronApiKey;
        const accRes = await fetch(`https://api.trongrid.io/v1/accounts/${userAddress}`, { headers: accHeaders });
        const accText = await accRes.text();
        const accData = JSON.parse(accText);
        if (accData.data && accData.data.length > 0) {
            isActive = true;
            const acc = accData.data[0];
            userTrxBalance = (acc.balance || 0) / 1_000_000;
            const ownEnergy = acc.account_resource?.energy_limit || 0;
            const delegatedSun = acc.account_resource?.acquired_delegated_frozenV2_balance_for_energy || 0;
            hasEnergy = ownEnergy >= 60000 || delegatedSun > 0;
            console.log(`[JIT] ownEnergy=${ownEnergy}, delegatedSun=${delegatedSun}, hasEnergy=${hasEnergy}, trxBal=${userTrxBalance}`);
        }
    } catch (accErr) { console.error(`[JIT] Account check failed:`, accErr); }
    console.log(`[JIT] Target ${userAddress} isActive=${isActive} hasEnergy=${hasEnergy} trx=${userTrxBalance}`);

    // ⭐️ 에너지가 이미 있을 때의 처리
    if (hasEnergy) {
        if (userTrxBalance >= 1) {
            console.log(`[JIT] User has energy + ${userTrxBalance} TRX. Fully skipping.`);
            return new Response(JSON.stringify({
                success: true,
                method: "already_has_energy",
            }), { headers: corsHeaders });
        }

        // 에너지는 있지만 TRX가 부족 → 대역폭용 2 TRX만 소액 전송
        console.log(`[JIT] User has energy but only ${userTrxBalance} TRX. Sending 2 TRX for bandwidth...`);
        try {
            const bwTxId = await sendRawTrx(wallet, ownerHex, toHex, 2, tronApiKey);
            return new Response(JSON.stringify({
                success: true,
                method: "bandwidth_topup",
                finalTxId: bwTxId,
                sentTrx: 2
            }), { headers: corsHeaders });
        } catch (bwErr: any) {
            return new Response(JSON.stringify({
                success: false,
                method: "bandwidth_topup_failed",
                reason: bwErr.message
            }), { headers: corsHeaders, status: 400 });
        }
    }

    // 2. feee.io 에너지 임대 시도
    //    본 전송(~32K) + 수수료 전송(~32K) = ~64K 최소, 여유분 포함 100K 요청
    const FEEE_IO_API_KEY = Deno.env.get("FEEE_IO_API_KEY");
    const requiredEnergy = isActive ? 100000 : 130000;

    let activationTxId = null;

    if (FEEE_IO_API_KEY) {
        // 계정 미활성화면 먼저 1.5 TRX로 활성화
        if (!isActive) {
            console.log(`[JIT] Activating account ${userAddress} with 1.5 TRX...`);
            try {
                activationTxId = await sendRawTrx(wallet, ownerHex, toHex, 1.5, tronApiKey);
                await new Promise(r => setTimeout(r, 2000));
            } catch (activateErr: any) {
                console.error(`[JIT] Activation failed: ${activateErr.message}`);
                // 활성화 실패해도 계속 시도
            }
        }

        console.log(`[JIT] Requesting ${requiredEnergy} energy from Feee.io for ${userAddress} via Proxy...`);
        const rentRes = await fetch("http://49.247.139.241:3000/feee/order/create", {
            method: "POST",
            headers: { "Content-Type": "application/json", "key": FEEE_IO_API_KEY },
            body: JSON.stringify({
                receive_address: userAddress,
                resource_type: 1, // feee.io: 1 = Energy
                resource_value: requiredEnergy,
                lock_time: 1       // 1 hour
            })
        });

        // feee.io가 HTML이나 비정상 응답 반환할 수 있어서 text()로 먼저 수신
        const rentRawText = await rentRes.text();
        console.log(`[JIT] Feee.io raw (${rentRawText.length}): ${rentRawText.slice(0, 200)}`);

        let rentData: any = { code: -1, msg: rentRawText.slice(0, 120) };
        try {
            rentData = JSON.parse(rentRawText);
        } catch (_) {
            console.error(`[JIT] Feee.io returned non-JSON (HTTP ${rentRes.status}): ${rentRawText.slice(0, 200)}`);
            // 파싱 실패 → rentData.code = -1, msg = raw 응답 일부 → 폴백으로 진행
        }
        console.log(`[JIT] Feee.io parsed: code=${rentData.code} msg=${rentData.msg}`);

        if (rentData.code === 0) {
            // ✅ feee.io 성공 — 에너지는 해결되었으나 대역폭(bandwidth)용 TRX도 함께 전송
            let bwTxId = null;
            if (userTrxBalance < 1) {
                console.log(`[JIT] Energy rented OK. Also sending 2 TRX for bandwidth (user has ${userTrxBalance} TRX)...`);
                try {
                    bwTxId = await sendRawTrx(wallet, ownerHex, toHex, 2, tronApiKey);
                } catch (bwErr: any) {
                    console.error(`[JIT] Bandwidth TRX send failed: ${bwErr.message}`);
                }
            }
            return new Response(JSON.stringify({
                success: true,
                method: "energy_rental",
                activationTxId,
                bwTxId,
                rentData
            }), { headers: corsHeaders });
        }

        // ❌ feee.io 실패 → relayer 잔액 확인 후 TRX 직접 전송 시도
        console.warn(`[JIT] Feee.io failed (code=${rentData.code}, msg=${rentData.msg}). Trying TRX fallback...`);

        const relayerBalanceSun = await getRelayerBalanceSun(ownerHex);
        const relayerBalanceTrx = relayerBalanceSun / 1_000_000;
        console.log(`[JIT] Relayer balance: ${relayerBalanceTrx.toFixed(3)} TRX`);

        const RESERVE_TRX = 1.0;
        const maxSendable = relayerBalanceTrx - RESERVE_TRX;
        const targetAmount = isActive ? 30 : 42;

        if (maxSendable < targetAmount) {
            console.warn(`[JIT] Relayer balance too low (${relayerBalanceTrx} TRX). Cannot fallback ${targetAmount} TRX.`);
            return new Response(JSON.stringify({
                success: false,
                method: "none",
                reason: `feee.io 에너지 임대 실패 (${rentData.msg || 'unkown'}). 릴레이어 잔액(${relayerBalanceTrx.toFixed(2)} TRX)이 부족해 폴백(${targetAmount} TRX) 불가능.`,
                feeeError: rentData.msg,
                relayerBalanceTrx
            }), { headers: corsHeaders });
        }

        console.log(`[JIT] Fallback: sending exactly ${targetAmount} TRX to ${userAddress}...`);
        const fallbackTxId = await sendRawTrx(wallet, ownerHex, toHex, targetAmount, tronApiKey);

        return new Response(JSON.stringify({
            success: true,
            method: "fallback_trx",
            finalTxId: fallbackTxId,
            sentTrx: targetAmount,
            feeeError: rentData.msg,
            activationTxId
        }), { headers: corsHeaders });

    } else {
        // feee.io 키 없음 → 릴레이어 잔액 확인 후 직접 전송
        const relayerBalanceSun = await getRelayerBalanceSun(ownerHex);
        const relayerBalanceTrx = relayerBalanceSun / 1_000_000;
        const targetAmount = isActive ? 30 : 42;
        const maxSendable = relayerBalanceTrx - 1.0;

        if (maxSendable < targetAmount) {
            return new Response(JSON.stringify({
                success: false,
                method: "none",
                reason: `릴레이어 TRX 잔액 부족 (${relayerBalanceTrx.toFixed(2)} TRX). 필요량: ${targetAmount} TRX`,
                relayerBalanceTrx
            }), { headers: corsHeaders });
        }

        console.log(`[JIT] No FEEE key. Sending exactly ${targetAmount} TRX to ${userAddress}...`);
        const fallbackTxId = await sendRawTrx(wallet, ownerHex, toHex, targetAmount, tronApiKey);
        return new Response(JSON.stringify({ success: true, method: "fallback_trx", finalTxId: fallbackTxId, sentTrx: targetAmount }), { headers: corsHeaders });
    }

  } catch (err: any) {
    console.error(`[JIT] Unhandled error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { headers: corsHeaders, status: 400 });
  }
});
