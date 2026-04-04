// ============================================================
// RWAYieldPanel.tsx — Trade 탭의 RWA 자산 목록 패널
// Phase 5-B + Aggregator Feature 1: NAV vs DEX 괴리율
// ============================================================

import { useState, useEffect } from 'react';
import { TrendingUp, Shield, ChevronRight, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  ALL_RWA_ASSETS,
  RWA_COMMODITY,
  RWA_TREASURY,
  RWA_CATEGORY_LABELS,
  RWA_CATEGORY_COLORS,
} from '../constants/rwaAssets';
import type { RWAAsset, RWACategory } from '../constants/rwaAssets';
import {
  fetchRWAPrices, formatApy, getChainName,
  fetchNAVData, formatSpread, getSpreadColor,
  RWA_LIQUIDITY_FALLBACK,
} from '../services/rwaService';
import type { RWAPriceMap, NAVMap, NAVData } from '../services/rwaService';

interface RWAYieldPanelProps {
  onSelectAsset?: (asset: RWAAsset) => void;
}

type FilterTab = 'all' | RWACategory;

// ============================================================
export function RWAYieldPanel({ onSelectAsset }: RWAYieldPanelProps) {
  const [prices, setPrices]       = useState<RWAPriceMap | null>(null);
  const [navMap, setNavMap]       = useState<NAVMap | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter]       = useState<FilterTab>('all');

  const loadPrices = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    try {
      const data = await fetchRWAPrices();
      setPrices(data);
      // NAV는 prices 이후 비동기로 — UI 블로킹 없음
      fetchNAVData(data).then(setNavMap).catch(console.error);
    } catch (e) {
      console.error('[RWAYieldPanel]', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { loadPrices(); }, []);

  const filteredAssets = ALL_RWA_ASSETS.filter(a =>
    filter === 'all' ? true : a.category === filter
  );

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all',       label: '전체' },
    { key: 'treasury',  label: RWA_CATEGORY_LABELS.treasury },
    { key: 'commodity', label: RWA_CATEGORY_LABELS.commodity },
  ];

  // 최고 디스카운트 자산 (헤더 배너용)
  const bestDiscount = navMap
    ? Object.values(navMap)
        .filter(n => n.isDiscount)
        .sort((a, b) => a.spreadPct - b.spreadPct)[0]
    : null;

  return (
    <div className="space-y-4 animate-fade-in">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide">
            TRADE <span className="text-emerald-400">.</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">실물 자산 토큰 — DEX 최적가 매수</p>
        </div>
        <button
          onClick={() => loadPrices(true)}
          disabled={isRefreshing}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 어그리게이터 배너 — NAV 대비 절약 강조 */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <TrendingUp size={18} className="text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-black text-white">DEX 어그리게이터 — 실물 시장보다 저렴하게</p>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
              실물 자산 기준가(NAV) 대비 DEX 가격을 실시간 비교해 최적 매수 경로를 제시합니다
            </p>
          </div>
        </div>

        {/* 베스트 디스카운트 표시 */}
        {bestDiscount ? (
          <div className="mt-3 flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
            <span className="text-[10px] text-slate-400">
              현재 최대 할인
              <span className="text-white font-bold ml-1">{bestDiscount.assetId.toUpperCase()}</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-emerald-400">
                {formatSpread(bestDiscount.spreadPct)}
              </span>
              <span className="text-[9px] text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                DEX 할인
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between bg-slate-800/50 rounded-xl px-3 py-2">
            <span className="text-[10px] text-slate-500">최고 APY</span>
            <span className="text-sm font-black text-emerald-400">5.1%</span>
          </div>
        )}
      </div>

      {/* 카테고리 필터 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`shrink-0 text-xs font-bold px-4 py-2 rounded-xl border transition-all ${
              filter === tab.key
                ? 'bg-slate-700 border-slate-600 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 자산 카드 목록 */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <div className="space-y-3">
          {filteredAssets.map(asset => (
            <RWACard
              key={asset.id}
              asset={asset}
              price={prices?.[asset.id] ?? null}
              navData={navMap?.[asset.id] ?? null}
              onSelect={onSelectAsset}
            />
          ))}
          {(filter === 'all' || filter === 'credit') && <ComingSoonCard />}
        </div>
      )}

      {/* 규제 면책 안내 */}
      <div className="flex items-start gap-2 bg-slate-900/50 border border-slate-800 rounded-xl p-3">
        <ShieldCheck size={12} className="text-slate-500 mt-0.5 shrink-0" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          RWA 투자는 KYC 인증이 필요합니다. $10,000 이상 거래 시 외국환거래법에 따라 거래 목적 입력이 필요합니다.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// RWA 자산 카드 — NAV vs DEX 괴리율 포함
// ============================================================
function RWACard({
  asset, price, navData, onSelect,
}: {
  asset: RWAAsset;
  price: RWAPriceMap[string] | null;
  navData: NAVData | null;
  onSelect?: (asset: RWAAsset) => void;
}) {
  const colors     = RWA_CATEGORY_COLORS[asset.category];
  const apyText    = formatApy(price?.apy ?? asset.fallbackApy);
  const isYield    = (price?.apy ?? asset.fallbackApy) > 0;
  const showSpread = navData && Math.abs(navData.spreadPct) >= 0.01;

  const priceDisplay = price
    ? price.priceUsd >= 1000
      ? `$${price.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${price.priceUsd.toFixed(4)}`
    : '로딩 중...';

  const changeDisplay = price
    ? `${price.change24h >= 0 ? '+' : ''}${price.change24h.toFixed(2)}%`
    : '';

  const isPositive = (price?.change24h ?? 0) >= 0;

  return (
    <button
      onClick={() => onSelect?.(asset)}
      disabled={!onSelect}
      className={`w-full text-left bg-slate-900 border ${colors.border} rounded-2xl p-4 transition-all
        ${onSelect ? 'hover:bg-slate-800 active:scale-[0.99] cursor-pointer' : 'cursor-default opacity-90'}
      `}
    >
      {/* 상단 — 아이콘 + 이름 + 가격/APY */}
      <div className="flex items-start gap-3">

        <div className={`w-12 h-12 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center shrink-0`}>
          <span className="text-2xl">{asset.category === 'treasury' ? '🏛️' : '🏅'}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-white">{asset.symbol}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
              {RWA_CATEGORY_LABELS[asset.category]}
            </span>
            <span className="text-[9px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
              {getChainName(asset.chainId)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{asset.name}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{asset.issuer}</p>
          <div className="flex gap-1 flex-wrap mt-1.5">
            {asset.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{tag}</span>
            ))}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className={`text-sm font-black ${isYield ? 'text-emerald-400' : 'text-teal-400'}`}>
            {apyText}
          </div>
          <div className="text-xs text-white font-mono mt-1">{priceDisplay}</div>
          {changeDisplay && (
            <div className={`text-[10px] font-bold mt-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {changeDisplay}
            </div>
          )}
          <div className="text-[9px] text-slate-500 mt-1">
            최소 ${asset.minInvestmentUsd.toLocaleString()}
          </div>
          {onSelect && <ChevronRight size={14} className="text-slate-600 ml-auto mt-1" />}
        </div>
      </div>

      {/* ── NAV vs DEX 괴리율 섹션 ── */}
      {showSpread && navData && (
        <div className={`mt-3 pt-3 border-t ${colors.border}`}>

          {/* 헤더 행 */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 font-bold">실물 NAV 대비 DEX 가격</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-black ${getSpreadColor(navData.spreadPct)}`}>
                {formatSpread(navData.spreadPct)}
              </span>
              {navData.isDiscount ? (
                <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                  DEX 할인
                </span>
              ) : navData.spreadPct >= 0.1 ? (
                <span className="text-[9px] font-black bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full">
                  프리미엄
                </span>
              ) : (
                <span className="text-[9px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full">
                  NAV 동일
                </span>
              )}
            </div>
          </div>

          {/* NAV vs DEX 비교 수치 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/60 rounded-xl px-3 py-2">
              <p className="text-[9px] text-slate-500 mb-0.5">{asset.navLabel}</p>
              <p className="text-xs font-black text-slate-300 font-mono">
                {navData.navUsd >= 1000
                  ? `$${navData.navUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : `$${navData.navUsd.toFixed(4)}`}
              </p>
            </div>
            <div className={`rounded-xl px-3 py-2 ${navData.isDiscount ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-800/60'}`}>
              <p className="text-[9px] text-slate-500 mb-0.5">DEX 현재가</p>
              <p className={`text-xs font-black font-mono ${navData.isDiscount ? 'text-emerald-400' : 'text-white'}`}>
                {navData.dexPriceUsd >= 1000
                  ? `$${navData.dexPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : `$${navData.dexPriceUsd.toFixed(4)}`}
              </p>
            </div>
          </div>

          {/* $10,000 절약 계산 (디스카운트 + $0.50 이상) */}
          {navData.isDiscount && navData.savingPer10k >= 0.5 && (
            <div className="mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-slate-400">$10,000 투자 시</p>
                <p className="text-[10px] text-emerald-300 font-bold">실물 시장 대비 절약</p>
              </div>
              <div className="text-right">
                <p className="text-base font-black text-emerald-400">+${navData.savingPer10k.toFixed(2)}</p>
                <p className="text-[9px] text-emerald-500">더 많이 받음</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Feature 5: 유동성 요약 배지 ── */}
      {(() => {
        const liq = RWA_LIQUIDITY_FALLBACK[asset.id];
        if (!liq) return null;
        const lvl = liq.liquidityUsd >= 10_000_000 ? { label: '유동성 높음', color: 'text-emerald-400', dot: 'bg-emerald-400' }
                  : liq.liquidityUsd >= 1_000_000  ? { label: '유동성 보통', color: 'text-teal-400',  dot: 'bg-teal-400'  }
                  :                                  { label: '유동성 낮음', color: 'text-blue-400',  dot: 'bg-blue-400'  };
        const fmtLiq = liq.liquidityUsd >= 1_000_000
          ? `$${(liq.liquidityUsd / 1_000_000).toFixed(1)}M`
          : `$${(liq.liquidityUsd / 1_000).toFixed(0)}K`;
        const fmtVol = liq.volume24hUsd >= 1_000_000
          ? `$${(liq.volume24hUsd / 1_000_000).toFixed(1)}M`
          : `$${(liq.volume24hUsd / 1_000).toFixed(0)}K`;
        return (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${lvl.dot}`} />
              <span className={`text-[9px] font-bold ${lvl.color}`}>{lvl.label}</span>
            </div>
            <span className="text-[9px] text-slate-600">TVL <span className="text-slate-400">{fmtLiq}</span></span>
            <span className="text-[9px] text-slate-600">24h <span className="text-slate-400">{fmtVol}</span></span>
            <span className="text-[9px] text-slate-600">{liq.source}</span>
          </div>
        );
      })()}

      {/* 설명 */}
      <p className="text-[10px] text-slate-500 mt-2 leading-relaxed line-clamp-2">
        {asset.description}
      </p>
    </button>
  );
}

// ============================================================
// Coming Soon 카드
// ============================================================
function ComingSoonCard() {
  return (
    <div className="w-full text-left bg-slate-900/50 border border-dashed border-slate-700 rounded-2xl p-4 opacity-60">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
          <span className="text-2xl">📋</span>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-400">크레딧 / 사모 채권</p>
          <p className="text-xs text-slate-600 mt-0.5">Maple Finance, Centrifuge 등 — 준비 중</p>
        </div>
        <div className="ml-auto">
          <span className="text-[9px] bg-slate-800 text-slate-500 px-2 py-1 rounded-lg font-bold">Coming Soon</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 로딩 스켈레톤
// ============================================================
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 animate-pulse">
          <div className="flex gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-slate-800 rounded w-1/3" />
              <div className="h-2 bg-slate-800 rounded w-1/2" />
              <div className="h-2 bg-slate-800 rounded w-1/4" />
            </div>
            <div className="w-16 space-y-2">
              <div className="h-4 bg-slate-800 rounded" />
              <div className="h-3 bg-slate-800 rounded" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2">
            <div className="h-10 bg-slate-800 rounded-xl" />
            <div className="h-10 bg-slate-800 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}