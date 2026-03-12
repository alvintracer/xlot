// supabase/functions/kyt-screen/index.ts
// TranSight KYT API 릴레이 Edge Function
// FAIL_CLOSED: API 장애 시 isBlocked=true, kytAvailable=false 반환

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TRANSIGHT_API_URL = Deno.env.get("TRANSIGHT_API_URL");
const TRANSIGHT_API_KEY = Deno.env.get("TRANSIGHT_API_KEY");
const KYT_TIMEOUT_MS = 8000;

// 이게 있어야 함
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface ScreenRequest {
  address: string;
  network: string;
  direction: "in" | "out";
  amount_usd?: number;
}

interface RiskResult {
  address: string;
  network: string;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: { category: string; severity: string; description: string }[];
  isSanctioned: boolean;
  isBlocked: boolean;
  kytAvailable: boolean;
  screenedAt: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  let body: ScreenRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "INVALID_REQUEST" }), {
      status: 400, headers: CORS,
    });
  }

  if (!body.address || !body.network) {
    return new Response(JSON.stringify({ error: "MISSING_PARAMS" }), {
      status: 400, headers: CORS,
    });
  }

  // ── TranSight API 호출 ────────────────────────────────────────────────────
  // TRANSIGHT_API_URL / TRANSIGHT_API_KEY 환경변수 미설정 시 FAIL_CLOSED
if (!TRANSIGHT_API_URL || !TRANSIGHT_API_KEY) {
  console.warn("[KYT] TranSight env vars not set — DEV MOCK 반환");

  // ✅ 개발용 mock — 테스트하고 싶은 시나리오로 risk_score 변경
  // risk_score 10  → LOW  (정상 통과)
  // risk_score 30  → MEDIUM (사유 입력 필요)
  // risk_score 60  → HIGH  (사유 입력 필요)
  // risk_score 80  → CRITICAL (차단)
  // is_sanctioned: true → CRITICAL 차단
  return new Response(
    JSON.stringify(normalize({
      risk_score: 60,
      is_sanctioned: false,
      flags: [{
        category: 'MIXER',
        severity: 'HIGH',
        description: '토네이도캐시 연관 주소'
      }]
    }, body.address, body.network)),
    { headers: CORS }
  );
}

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), KYT_TIMEOUT_MS);

    const response = await fetch(`${TRANSIGHT_API_URL}/v1/address/screen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TRANSIGHT_API_KEY,
        "X-Request-ID": crypto.randomUUID(),
      },
      body: JSON.stringify({
        address: body.address,
        asset: mapNetworkToAsset(body.network),
        direction: body.direction ?? "out",
        amount_usd: body.amount_usd ?? 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[KYT] TranSight API ${response.status}`);
      return new Response(
        JSON.stringify(buildFailClosed(body.address, body.network)),
        { headers: CORS }
      );
    }

    const data = await response.json();
    const result = normalize(data, body.address, body.network);
    return new Response(JSON.stringify(result), { headers: CORS });

  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error(`[KYT] ${isTimeout ? "Timeout" : "Network error"}:`, err);
    return new Response(
      JSON.stringify(buildFailClosed(body.address, body.network)),
      { headers: CORS }
    );
  }
});

// ─── TranSight 응답 정규화 ────────────────────────────────────────────────────
// ※ TranSight 실제 응답 스펙에 따라 필드명 조정 필요
function normalize(
  data: Record<string, unknown>,
  address: string,
  network: string
): RiskResult {
  const riskScore = (data.risk_score as number) ?? 0;
  const isSanctioned = (data.is_sanctioned as boolean) ?? false;
  const riskLevel: RiskLevel = isSanctioned ? "CRITICAL" : scoreToLevel(riskScore);

  return {
    address,
    network,
    riskScore,
    riskLevel,
    flags: Array.isArray(data.flags)
      ? (data.flags as Record<string, string>[]).map((f) => ({
          category: f.category ?? "UNKNOWN",
          severity: f.severity ?? "LOW",
          description: f.description ?? "",
        }))
      : [],
    isSanctioned,
    isBlocked: isSanctioned || riskScore >= 75,
    kytAvailable: true,
    screenedAt: Date.now(),
  };
}

function buildFailClosed(address: string, network: string): RiskResult {
  return {
    address,
    network,
    riskScore: -1,
    riskLevel: "CRITICAL",
    flags: [{
      category: "KYT_UNAVAILABLE",
      severity: "HIGH",
      description: "위험도 분석 서비스 일시 장애 — 보안 정책에 따라 전송 차단",
    }],
    isSanctioned: false,
    isBlocked: true,
    kytAvailable: false,
    screenedAt: Date.now(),
  };
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

// 네트워크 → TranSight asset 코드 매핑
// TranSight 실제 코드에 맞게 조정
function mapNetworkToAsset(network: string): string {
  const map: Record<string, string> = {
    ethereum: "ETH",
    sepolia: "ETH",
    polygon: "POL",
    amoy: "POL",
    base: "ETH",
    arbitrum: "ETH",
    optimism: "ETH",
    solana: "SOL",
    tron: "TRX",
    bitcoin: "BTC",
    "binance smart chain": "BNB",
  };
  return map[network.toLowerCase()] ?? network.toUpperCase();
}