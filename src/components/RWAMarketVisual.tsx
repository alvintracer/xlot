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
    <div className="h-full flex flex-col w-full min-w-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Price Trend</span>
          <span className="text-[9px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">30D</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-slate-500 rounded-sm" />
            <span className="text-[9px] font-bold text-slate-400">NAV</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-sm" />
            <span className="text-[9px] font-bold text-cyan-500">DEX</span>
          </div>
        </div>
      </div>

      <div className="w-full flex-1 min-h-[140px] relative mt-auto">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-bold text-slate-500 animate-pulse">Loading data...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="dexGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="dateStr" 
                tick={{ fontSize: 9, fill: '#475569', fontWeight: 'bold' }} 
                tickMargin={8}
                axisLine={false} 
                tickLine={false}
                minTickGap={20}
              />
              <YAxis 
                domain={yDomain} 
                tickFormatter={fmtPrice} 
                tick={{ fontSize: 9, fill: '#475569', fontWeight: '600' }} 
                axisLine={false} 
                tickLine={false}
                width={50}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-[#0f172a]/95 backdrop-blur-md border border-slate-700/50 p-2.5 rounded-xl shadow-2xl space-y-1.5">
                        <p className="text-[9px] text-slate-400 font-bold">{label}</p>
                        {payload.map((entry, idx) => (
                          <div key={idx} className="flex justify-between items-center gap-4">
                            <span className="text-[10px] font-black" style={{ color: entry.color }}>
                              {entry.name === 'navPrice' ? 'NAV' : 'DEX'}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-white">
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
                stroke="#64748b" 
                strokeWidth={1.5}
                fillOpacity={1} 
                fill="url(#navGradient)" 
              />
              <Area 
                type="monotone" 
                dataKey="dexPrice" 
                name="dexPrice"
                stroke="#22d3ee" 
                strokeWidth={1.5}
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
    <div className="flex flex-col h-full w-full min-w-0">
      <div className="flex items-center justify-between mb-0 px-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Prem/Disc</span>
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${isDiscount ? 'text-emerald-400 bg-emerald-500/10' : isPremium ? 'text-red-400 bg-red-500/10' : 'text-slate-400 bg-slate-800'}`}>
          {spread > 0 ? '+' : ''}{spread.toFixed(2)}%
        </span>
      </div>

      <div className="flex-1 flex items-end justify-center px-2 pb-0 mt-[-5px]">
        <svg viewBox="0 15 300 115" className="w-[110%] max-w-[200px] sm:max-w-full drop-shadow-xl overflow-visible">
          {/* 배경 반원 트랙 */}
          <path d={arcPath(0, 90, R)} fill="none" stroke="#064e3b" strokeWidth="12" strokeLinecap="butt" />
          <path d={arcPath(85, 95, R)} fill="none" stroke="#0f172a" strokeWidth="14" strokeLinecap="butt" />
          <path d={arcPath(90, 180, R)} fill="none" stroke="#4c0519" strokeWidth="12" strokeLinecap="butt" />

          {/* 채워진 게이지 */}
          {isDiscount && (
            <path d={arcPath(pointerDeg, 90, R)} fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" opacity="0.9" />
          )}
          {isPremium && (
            <path d={arcPath(90, pointerDeg, R)} fill="none" stroke="#f43f5e" strokeWidth="12" strokeLinecap="round" opacity="0.9" />
          )}
          {isNeutral && (
            <path d={arcPath(89, 91, R)} fill="none" stroke="#94a3b8" strokeWidth="12" strokeLinecap="round" />
          )}

          {/* 눈금 마커 간소화 (0%만) */}
          {[-2, 0, 2].map(v => {
            const deg = 90 + (v / MAX_RANGE) * 90;
            const r1  = (d: number) => (d * Math.PI) / 180;
            const tx  = CX + (R - 20) * Math.cos(r1(deg));
            const ty  = CY - (R - 20) * Math.sin(Math.PI - r1(deg));
            return (
              <text key={v} x={tx} y={ty} fill="#475569" fontSize="7" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                {v > 0 ? `+${v}%` : v === 0 ? '0' : `${v}%`}
              </text>
            );
          })}

          {/* 포인터 바늘 */}
          <line x1={CX} y1={CY} x2={px} y2={py} stroke={needleColor} strokeWidth="3" strokeLinecap="round" />
          <circle cx={CX} cy={CY} r="6" fill="#0f172a" stroke={needleColor} strokeWidth="2.5" />

          {/* 중앙 하단 수치 표시 — 텍스트 크기 증가, 줄임 */}
          <text x={CX} y={CY + 18} fill={needleColor} fontSize="14" fontWeight="900" textAnchor="middle">
            {spread > 0 ? '+' : ''}{spread.toFixed(2)}%
          </text>

          {/* 좌우 레이블 */}
          <text x="30" y={CY + 15} fill="#10b981" fontSize="6.5" fontWeight="black" textAnchor="middle">DISCOUNT</text>
          <text x="270" y={CY + 15} fill="#f43f5e" fontSize="6.5" fontWeight="black" textAnchor="middle">PREMIUM</text>

          {/* 상태 배지 제거 (denser) */}
        </svg>
      </div>

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
    <div className="h-full flex flex-col w-full min-w-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Liquidity</span>
        <span className="text-[9px] text-slate-500 font-bold bg-slate-800 px-1.5 py-0.5 rounded">DEX split</span>
      </div>

      <div className="flex items-center gap-3 flex-1 px-1">
        {/* 도넛 */}
        <div className="w-20 h-20 shrink-0 mx-auto">
          <svg viewBox="0 0 160 160" className="w-full h-full drop-shadow-xl overflow-visible">
            {slices.map((sl, i) => (
              <path key={i} d={sl.path} fill={sl.color} opacity="0.95" stroke="#020617" strokeWidth="2.5" />
            ))}
            <circle cx={CX} cy={CY} r={INNER_R - 1} fill="#020617" />
            <text x={CX} y={CY + 4} fill="#e2e8f0" fontSize="18" fontWeight="900" textAnchor="middle">
              {totalLiq > 0 ? slices.length : 0}
            </text>
          </svg>
        </div>

        {/* 범례 */}
        <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
          {slices.map((sl, i) => (
            <div key={i} className="flex justify-between items-center text-[10px] gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-1 h-3 rounded-full shrink-0" style={{ backgroundColor: sl.color }} />
                <span className="text-slate-300 font-bold truncate">{sl.label}</span>
              </div>
              <span className="text-white font-mono font-bold shrink-0">{Math.round(sl.value)}%</span>
            </div>
          ))}
          {vol24h > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex justify-between items-center">
               <span className="text-[9px] font-bold text-slate-500">24H Vol</span>
               <span className="text-[10px] text-slate-300 font-mono font-bold">{fmtLiq(vol24h)}</span>
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
    <div className="bg-[#020617] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* 밀도 높은 헤더 */}
      <div className="px-3 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <div className="w-2 h-4 rounded-sm bg-cyan-500" />
        <span className="text-[11px] font-black text-white uppercase tracking-wider">Market Analytics</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 bg-[#020617] px-1.5 py-0.5 rounded border border-slate-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-800 flex-1">
        {/* 1. 가격 비교 (역사적 라인 차트) */}
        <div className="p-3 bg-[#020617]">
          <HistoricalPriceChart asset={asset} navData={navData} />
        </div>

        {/* 2 & 3. 스프레드 게이지 & 유동성 도넛 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 bg-[#020617]">
          <div className="p-3 pb-2 flex items-center justify-center">
            <SpreadGauge navData={navData} />
          </div>
          <div className="p-3">
            <LiquidityDonut routeResult={routeResult} liquidityFallback={liquidityFallback} />
          </div>
        </div>
      </div>
    </div>
  );
}