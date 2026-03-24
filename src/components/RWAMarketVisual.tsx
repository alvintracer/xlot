// ============================================================
// RWAMarketVisual.tsx
// RWA 시장 데이터 시각화 컴포넌트
//
// 1. PriceCompareChart  — NAV vs DEX 소스별 가격 수평 바 차트
// 2. SpreadGauge        — 프리미엄/디스카운트 게이지
// 3. LiquidityDonut     — DEX별 유동성 도넛 차트
// ============================================================

import type { NAVData } from '../services/rwaService';
import type { DEXRouteResult } from '../services/swapService';
import { getDexColor, getDexLabel } from '../services/swapService';
import type { RWAAsset } from '../constants/rwaAssets';
import { useState, useEffect, useMemo } from 'react';
import { fetchHistoricalData, type HistoricalDataPoint } from '../services/rwaService';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function HistoricalPriceChart({
  asset,
  navData,
}: {
  asset: RWAAsset;
  navData: NAVData;
}) {
  const [data, setData] = useState<HistoricalDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsLoading(true);
      const points = await fetchHistoricalData(asset, navData.navUsd, 30);
      if (active) {
        setData(points);
        setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [asset, navData.navUsd]);

  // Y축 범위 계산 (최저, 최고가에 여유 공간 확보)
  const yDomain = useMemo(() => {
    if (!data.length) return ['auto', 'auto'];
    let min = Infinity, max = -Infinity;
    data.forEach(d => {
      min = Math.min(min, d.navPrice, d.dexPrice);
      max = Math.max(max, d.navPrice, d.dexPrice);
    });
    const padding = (max - min) * 0.2;
    return [Math.max(0, min - padding), max + padding];
  }, [data]);

  const fmtPrice = (p: number) =>
    p >= 1000
      ? `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `$${p.toFixed(4)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-white">가격 비교 트렌드</span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">최근 30일</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-slate-500" />
            <span className="text-xs text-slate-400 font-bold">NAV (기준가)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />
            <span className="text-xs text-slate-300 font-bold">DEX (시장가)</span>
          </div>
        </div>
      </div>

      <div className="w-full h-[180px] relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-slate-500 animate-pulse">데이터 로딩 중...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="dexGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="dateStr" 
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} 
                tickMargin={10}
                axisLine={false} 
                tickLine={false}
                minTickGap={20}
              />
              <YAxis 
                domain={yDomain} 
                tickFormatter={fmtPrice} 
                tick={{ fontSize: 10, fill: '#64748b' }} 
                axisLine={false} 
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl space-y-2">
                        <p className="text-xs text-slate-400 font-bold">{label}</p>
                        {payload.map((entry, idx) => (
                          <div key={idx} className="flex justify-between gap-4">
                            <span className="text-sm font-bold" style={{ color: entry.color }}>
                              {entry.name === 'navPrice' ? 'NAV' : 'DEX'}
                            </span>
                            <span className="text-sm font-mono text-white">
                              {fmtPrice(entry.value as number)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="navPrice" 
                name="navPrice"
                stroke="#94a3b8" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#navGradient)" 
              />
              <Area 
                type="monotone" 
                dataKey="dexPrice" 
                name="dexPrice"
                stroke="#22d3ee" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#dexGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 2. 프리미엄 / 디스카운트 게이지
// ============================================================

export function SpreadGauge({ navData }: { navData: NAVData }) {
  const spread  = navData.spreadPct;

  // 게이지 범위: -2% ~ +2% (중앙 = 0)
  const MAX_RANGE = 2.0;
  const clampedSpread = Math.max(-MAX_RANGE, Math.min(MAX_RANGE, spread));

  // SVG 반원 게이지
  // 중앙 x=150, 반지름=100, 반원 (180도)
  const CX = 150, CY = 110, R = 90;
  const toAngle = (pct: number) => (pct / MAX_RANGE) * 90; // -90~+90도 매핑

  // 포인터 각도: 0%=90도(상단), -2%=0도(왼쪽), +2%=180도(오른쪽)
  const pointerDeg = 90 + toAngle(clampedSpread);
  const rad = (pointerDeg * Math.PI) / 180;
  const px  = CX + R * Math.cos(rad);
  const py  = CY - R * Math.sin(Math.PI - rad);

  // 반원 path 헬퍼
  const arcPath = (startDeg: number, endDeg: number, r: number) => {
    const s = (startDeg * Math.PI) / 180;
    const e = (endDeg   * Math.PI) / 180;
    const x1 = CX + r * Math.cos(s);
    const y1 = CY - r * Math.sin(Math.PI - s);
    const x2 = CX + r * Math.cos(e);
    const y2 = CY - r * Math.sin(Math.PI - e);
    const lg = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2}`;
  };

  const isDiscount = spread <= -0.05;
  const isPremium  = spread >=  0.05;
  const isNeutral  = !isDiscount && !isPremium;

  const needleColor = isDiscount ? '#10b981' : isPremium ? '#f43f5e' : '#94a3b8';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-black text-white">프리미엄 / 디스카운트</span>
        <span className={`text-sm font-black bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 ${isDiscount ? 'text-emerald-400' : isPremium ? 'text-red-400' : 'text-slate-400'}`}>
          {spread > 0 ? '+' : ''}{spread.toFixed(3)}%
        </span>
      </div>

      <svg viewBox="0 0 300 130" className="w-full mt-2">
        {/* 배경 반원 트랙 — 3구간 (디스카운트/중립/프리미엄) */}
        {/* 디스카운트 구간 (0~90도) */}
        <path d={arcPath(0, 90, R)} fill="none"
          stroke="#064e3b" strokeWidth="14" strokeLinecap="butt" />
        {/* 중립 구간 (85~95도) */}
        <path d={arcPath(85, 95, R)} fill="none"
          stroke="#1e293b" strokeWidth="16" strokeLinecap="butt" />
        {/* 프리미엄 구간 (90~180도) */}
        <path d={arcPath(90, 180, R)} fill="none"
          stroke="#4c0519" strokeWidth="14" strokeLinecap="butt" />

        {/* 채워진 게이지 (0% 기준에서 현재까지) */}
        {isDiscount && (
          <path d={arcPath(pointerDeg, 90, R)} fill="none"
            stroke="#10b981" strokeWidth="14" strokeLinecap="round" opacity="0.8" />
        )}
        {isPremium && (
          <path d={arcPath(90, pointerDeg, R)} fill="none"
            stroke="#f43f5e" strokeWidth="14" strokeLinecap="round" opacity="0.8" />
        )}
        {isNeutral && (
          <path d={arcPath(88, 92, R)} fill="none"
            stroke="#94a3b8" strokeWidth="14" strokeLinecap="round" />
        )}

        {/* 눈금 마커 */}
        {[-2, -1, 0, 1, 2].map(v => {
          const deg = 90 + (v / MAX_RANGE) * 90;
          const r1  = (d: number) => (d * Math.PI) / 180;
          const mx1 = CX + (R - 18) * Math.cos(r1(deg));
          const my1 = CY - (R - 18) * Math.sin(Math.PI - r1(deg));
          const mx2 = CX + (R + 2)  * Math.cos(r1(deg));
          const my2 = CY - (R + 2)  * Math.sin(Math.PI - r1(deg));
          const tx  = CX + (R - 26) * Math.cos(r1(deg));
          const ty  = CY - (R - 26) * Math.sin(Math.PI - r1(deg));
          return (
            <g key={v}>
              <line x1={mx1} y1={my1} x2={mx2} y2={my2}
                stroke="#334155" strokeWidth={v === 0 ? 1.5 : 0.8} />
              <text x={tx} y={ty + 1.5} fill="#475569" fontSize="5.5"
                textAnchor="middle" dominantBaseline="middle">
                {v > 0 ? `+${v}%` : `${v}%`}
              </text>
            </g>
          );
        })}

        {/* 포인터 바늘 */}
        <line
          x1={CX} y1={CY}
          x2={px} y2={py}
          stroke={needleColor} strokeWidth="2.5" strokeLinecap="round"
        />
        {/* 바늘 중심 원 */}
        <circle cx={CX} cy={CY} r="5" fill="#0f172a" stroke={needleColor} strokeWidth="2" />

        {/* 중앙 수치 표시 */}
        <text x={CX} y={CY + 20} fill={needleColor} fontSize="11"
          fontWeight="bold" textAnchor="middle">
          {spread > 0 ? '+' : ''}{spread.toFixed(3)}%
        </text>
        <text x={CX} y={CY + 30} fill="#64748b" fontSize="5.5" textAnchor="middle">
          NAV 대비 DEX 가격
        </text>

        {/* 좌우 레이블 */}
        <text x="18" y={CY + 8} fill="#10b981" fontSize="5.5" fontWeight="bold" textAnchor="middle">
          디스카운트
        </text>
        <text x="18" y={CY + 15} fill="#10b981" fontSize="5" textAnchor="middle">
          (저렴)
        </text>
        <text x="282" y={CY + 8} fill="#f43f5e" fontSize="5.5" fontWeight="bold" textAnchor="middle">
          프리미엄
        </text>
        <text x="282" y={CY + 15} fill="#f43f5e" fontSize="5" textAnchor="middle">
          (비쌈)
        </text>

        {/* 상태 뱃지 */}
        {isDiscount && (
          <g>
            <rect x="110" y="75" width="80" height="16" rx="8"
              fill="#064e3b" stroke="#10b981" strokeWidth="0.8" />
            <text x="150" y="85.5" fill="#10b981" fontSize="6"
              fontWeight="bold" textAnchor="middle">
              DEX 할인 — 지금이 유리
            </text>
          </g>
        )}
        {isPremium && (
          <g>
            <rect x="105" y="75" width="90" height="16" rx="8"
              fill="#4c0519" stroke="#f43f5e" strokeWidth="0.8" />
            <text x="150" y="85.5" fill="#f43f5e" fontSize="6"
              fontWeight="bold" textAnchor="middle">
              프리미엄 — NAV 대비 비쌈
            </text>
          </g>
        )}
        {isNeutral && (
          <g>
            <rect x="110" y="75" width="80" height="16" rx="8"
              fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
            <text x="150" y="85.5" fill="#94a3b8" fontSize="6"
              fontWeight="bold" textAnchor="middle">
              NAV 동일 — 적정 가격
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ============================================================
// 3. 유동성 도넛 차트
// ============================================================

interface LiquiditySegment {
  label: string;
  value: number;
  color: string;
}

export function LiquidityDonut({
  routeResult,
  liquidityFallback,
}: {
  routeResult: DEXRouteResult | null;
  liquidityFallback: { liquidityUsd: number; volume24hUsd: number; source: string } | null;
}) {
  // 세그먼트 구성 — DEX별 유동성 비중
  // routeResult.routes의 part 비중을 유동성으로 매핑
  const totalLiq = routeResult?.liquidityUsd ?? liquidityFallback?.liquidityUsd ?? 0;
  const vol24h   = routeResult?.volume24hUsd ?? liquidityFallback?.volume24hUsd ?? 0;

  const segments: LiquiditySegment[] = routeResult?.routes.length
    ? routeResult.routes.map(r => ({
        label: getDexLabel(r.name),
        value: r.part,             // part % = 유동성 비중으로 근사
        color: getDexColor(r.name),
      }))
    : [
        { label: 'Uniswap V3', value: 65, color: '#FF007A' },
        { label: 'Curve',      value: 25, color: '#3466AA' },
        { label: 'Others',     value: 10, color: '#6B7280' },
      ];

  // 도넛 SVG 계산
  const CX = 80, CY = 80, R = 58, INNER_R = 36;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  const slices = segments.reduce<{
    arr: Array<LiquiditySegment & { path: string; lx: number; ly: number; midA: number; angle: number }>;
    currentAngle: number;
  }>((acc, seg) => {
    const angle   = (seg.value / total) * 360;
    const startA  = acc.currentAngle;
    const endA    = startA + angle;

    const toRad = (d: number) => (d * Math.PI) / 180;
    const x1 = CX + R * Math.cos(toRad(startA));
    const y1 = CY + R * Math.sin(toRad(startA));
    const x2 = CX + R * Math.cos(toRad(endA));
    const y2 = CY + R * Math.sin(toRad(endA));
    const ix1 = CX + INNER_R * Math.cos(toRad(startA));
    const iy1 = CY + INNER_R * Math.sin(toRad(startA));
    const ix2 = CX + INNER_R * Math.cos(toRad(endA));
    const iy2 = CY + INNER_R * Math.sin(toRad(endA));
    const lg  = angle > 180 ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${lg} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${INNER_R} ${INNER_R} 0 ${lg} 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ');

    // 레이블 위치 (중간 각도)
    const midA  = startA + angle / 2;
    const labelR = R + 14;
    const lx = CX + labelR * Math.cos(toRad(midA));
    const ly = CY + labelR * Math.sin(toRad(midA));

    acc.arr.push({ ...seg, path, lx, ly, midA, angle });
    acc.currentAngle = endA;
    return acc;
  }, { arr: [], currentAngle: -90 }).arr;

  const fmtLiq = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000   ? `$${(v / 1_000).toFixed(0)}K`
    : `$${v.toFixed(0)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-black text-white">유동성 분포</span>
        <span className="text-xs text-slate-500">DEX별 비중</span>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 px-2">
        {/* 도넛 */}
        <div className="flex-shrink-0 w-36 sm:w-32 xl:w-40 2xl:w-48 mx-auto sm:mx-0">
          <svg viewBox="0 0 160 160" className="w-full h-auto drop-shadow-xl">
          {slices.map((sl, i) => (
            <g key={i}>
              <path d={sl.path} fill={sl.color} opacity="0.85"
                stroke="#0f172a" strokeWidth="1.5" />
              {/* 비중 크면 레이블 표시 */}
              {sl.angle > 25 && (
                <text x={sl.lx} y={sl.ly}
                  fill="#e2e8f0" fontSize="5.5" fontWeight="bold"
                  textAnchor="middle" dominantBaseline="middle">
                  {Math.round(sl.value)}%
                </text>
              )}
            </g>
          ))}

          {/* 도넛 중앙 — TVL */}
          <circle cx={CX} cy={CY} r={INNER_R - 2} fill="#0f172a" />
          <text x={CX} y={CY - 8} fill="#e2e8f0" fontSize="8"
            fontWeight="bold" textAnchor="middle">
            {totalLiq > 0 ? fmtLiq(totalLiq) : '—'}
          </text>
          <text x={CX} y={CY + 2} fill="#64748b" fontSize="5"
            textAnchor="middle">TVL</text>
          <text x={CX} y={CY + 11} fill="#22d3ee" fontSize="6.5"
            fontWeight="bold" textAnchor="middle">
            {vol24h > 0 ? fmtLiq(vol24h) : ''}
          </text>
          {vol24h > 0 && (
            <text x={CX} y={CY + 19} fill="#64748b" fontSize="4.5"
              textAnchor="middle">24h Vol</text>
          )}
        </svg>
        </div>

        {/* 범례 */}
        <div className="flex-1 w-full space-y-3">
          {slices.map((sl, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-3 h-3 rounded-md shrink-0 border border-slate-700/50"
                  style={{ backgroundColor: sl.color }} />
                <span className="text-sm font-bold text-slate-300 truncate">{sl.label}</span>
              </div>
              <div className="text-right shrink-0 max-w-[50%] truncate">
                <span className="text-sm font-black text-white">{Math.round(sl.value)}%</span>
                {totalLiq > 0 && (
                  <span className="text-xs text-slate-500 ml-2 font-mono truncate">
                    {fmtLiq(totalLiq * sl.value / 100)}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* 회전율 */}
          {totalLiq > 0 && vol24h > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">일 회전율</span>
                <span className="text-sm font-black text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded-md">
                  {((vol24h / totalLiq) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 4. 통합 래퍼 — 3개 시각화 모아서 보여주는 패널
// ============================================================

export function RWAMarketVisualPanel({
  asset,
  navData,
  routeResult,
  liquidityFallback,
}: {
  asset: RWAAsset;
  navData: NAVData | null;
  routeResult: DEXRouteResult | null;
  liquidityFallback: { liquidityUsd: number; volume24hUsd: number; source: string } | null;
}) {
  if (!navData) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-5">

      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <div className="w-2 h-5 rounded-full bg-cyan-400" />
        <span className="text-base font-black text-white">시장 분석</span>
        <span className="text-xs font-bold text-slate-500 ml-auto bg-slate-800 px-3 py-1 rounded-full">
          {asset.symbol} · 실시간
        </span>
      </div>

      {/* 1. 가격 비교 (역사적 라인 차트) */}
      <div className="bg-slate-950/60 rounded-xl p-4">
        <HistoricalPriceChart
          asset={asset}
          navData={navData}
        />
      </div>

      {/* 구분선 */}
      <div className="border-t border-slate-800" />

      {/* 2. 스프레드 게이지 */}
      <div className="bg-slate-950/60 rounded-xl p-3">
        <SpreadGauge navData={navData} />
      </div>

      {/* 구분선 */}
      <div className="border-t border-slate-800" />

      {/* 3. 유동성 도넛 */}
      <div className="bg-slate-950/60 rounded-xl p-3">
        <LiquidityDonut
          routeResult={routeResult}
          liquidityFallback={liquidityFallback}
        />
      </div>
    </div>
  );
}