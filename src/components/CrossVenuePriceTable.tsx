// ============================================================
// CrossVenuePriceTable.tsx — Cross-Venue Price Comparison
// Shows the same underlying asset (e.g. Gold) priced across
// all venues side by side for arbitrage/best-execution analysis.
// ============================================================

import { useMemo } from 'react';
import type { RWAInstrument } from '../types/rwaInstrument';
import { ALL_INSTRUMENTS } from '../constants/rwaInstruments';
import { VENUE_CATEGORY_META, STRUCTURE_LABELS, EXECUTION_LABELS } from '../types/rwaInstrument';
import type { RWAPriceMap, NAVMap } from '../services/rwaService';
import { RWA_LIQUIDITY_FALLBACK } from '../services/rwaService';
import { ArrowUpDown, Zap, ExternalLink, TrendingUp, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GroupIcon } from '../components/InstrumentIcon';
import { useTranslation } from 'react-i18next';

interface CrossVenuePriceTableProps {
  underlyingKey: string;         // e.g. "Gold", "Silver"
  prices: RWAPriceMap;
  navMap: NAVMap;
  onSelectInstrument: (inst: RWAInstrument) => void;
  selectedId?: string;
}

// Group underlying reference keywords
function matchesUnderlying(inst: RWAInstrument, key: string): boolean {
  const lower = key.toLowerCase();
  const ref = inst.underlyingReference.toLowerCase();
  const sub = (inst.subCategory || '').toLowerCase();

  if (lower === 'gold' || lower === 'xau') {
    return sub.includes('gold') || ref.includes('gold') || ref.includes('xau');
  }
  if (lower === 'silver' || lower === 'xag') {
    return sub.includes('silver') || ref.includes('silver') || ref.includes('xag');
  }
  if (lower === 'copper') {
    return sub.includes('copper') || ref.includes('copper');
  }
  if (lower === 'oil' || lower === 'brent') {
    return sub.includes('oil') || ref.includes('oil') || ref.includes('brent');
  }

  return ref.includes(lower) || sub.includes(lower);
}

// Determine underlying groups from all instruments
export function getUnderlyingGroups(): { key: string; label: string; icon: string; count: number }[] {
  const groups: Record<string, { label: string; icon: string; ids: Set<string> }> = {};

  for (const inst of ALL_INSTRUMENTS) {
    const sub = (inst.subCategory || '').toLowerCase();
    let key = '';
    let label = '';
    let icon = '🏅';

    if (sub.includes('gold') || inst.underlyingReference.toLowerCase().includes('gold') || inst.underlyingReference.toLowerCase().includes('xau')) {
      key = 'gold'; label = 'Gold (XAU)'; icon = '🥇';
    } else if (sub.includes('silver') || inst.underlyingReference.toLowerCase().includes('silver') || inst.underlyingReference.toLowerCase().includes('xag')) {
      key = 'silver'; label = 'Silver (XAG)'; icon = '🥈';
    } else if (sub.includes('copper') || inst.underlyingReference.toLowerCase().includes('copper')) {
      key = 'copper'; label = 'Copper'; icon = '🟤';
    } else if (sub.includes('oil') || inst.underlyingReference.toLowerCase().includes('oil') || inst.underlyingReference.toLowerCase().includes('brent')) {
      key = 'oil'; label = 'Brent Oil'; icon = '🛢️';
    } else {
      continue; // skip non-commodity / non-groupable
    }

    if (!groups[key]) groups[key] = { label, icon, ids: new Set() };
    groups[key].ids.add(inst.id);
  }

  return Object.entries(groups)
    .filter(([, g]) => g.ids.size >= 2) // Only show groups with 2+ venues
    .map(([key, g]) => ({ key, label: g.label, icon: g.icon, count: g.ids.size }));
}

export function CrossVenuePriceTable({ underlyingKey, prices, navMap, onSelectInstrument, selectedId }: CrossVenuePriceTableProps) {
  const { t } = useTranslation();
  const instruments = useMemo(() =>
    ALL_INSTRUMENTS.filter(inst => matchesUnderlying(inst, underlyingKey)),
    [underlyingKey]
  );

  if (instruments.length < 2) return null;

  // Find reference price (average of all available prices)
  const validPrices = instruments
    .map(i => prices[i.id]?.priceUsd)
    .filter((p): p is number => p != null && p > 0);
  const avgPrice = validPrices.length > 0 ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0;

  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(6)}`;
  };

  const formatVolume = (v: number) => {
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  // Sort: best price (for long = lowest) first
  const sorted = [...instruments].sort((a, b) => {
    const pa = prices[a.id]?.priceUsd || a.fallbackNavUsd;
    const pb = prices[b.id]?.priceUsd || b.fallbackNavUsd;
    return pa - pb;
  });

  const groups = getUnderlyingGroups();
  const currentGroup = groups.find(g => g.key === underlyingKey);

  const pieData = useMemo(() => {
    return sorted.map(inst => {
      const prc = prices[inst.id];
      const liq = RWA_LIQUIDITY_FALLBACK[inst.id];
      const vol = liq?.volume24hUsd || prc?.marketCapUsd || 0;
      return {
        name: inst.issuer,
        value: vol,
        color: inst.venueCategory === 'dex_spot' ? '#34d399' :
               inst.venueCategory === 'onchain_perps' ? '#60a5fa' :
               inst.venueCategory === 'cex_perps' ? '#fbbf24' : '#c084fc',
      };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [sorted, prices]);

  const totalVol = useMemo(() => pieData.reduce((acc, curr) => acc + curr.value, 0), [pieData]);

  return (
    <div className="bg-[#0a0f1e] border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 bg-gradient-to-r from-slate-900/50 to-transparent border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="shrink-0 flex items-center">
              {currentGroup ? <GroupIcon groupKey={currentGroup.key} className="w-5 h-5 flex-shrink-0" /> : null}
            </span>
            <div>
              <h3 className="text-xs font-black text-white">
                {currentGroup?.label || underlyingKey} — {t('trade.terms.cross_compare')}
              </h3>
              <p className="text-[9px] text-slate-500">{instruments.length} markets · Avg {formatPrice(avgPrice)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-slate-500">
            <Activity size={10} />
            <span>Live</span>
          </div>
        </div>
      </div>

      {/* ── Market Share Visual ── */}
      {pieData.length > 0 && (
        <div className="p-4 border-b border-slate-800/50 flex flex-col items-center">
          <p className="text-[10px] text-slate-500 font-bold mb-2">24h Volume Market Share (Total: {formatVolume(totalVol)})</p>
          <div className="w-full flex items-center justify-center gap-4">
            <div className="w-[120px] h-[120px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    stroke="none"
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} opacity={0.9} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '11px', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                    formatter={(value: any) => [formatVolume(Number(value) || 0), 'Volume']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Legend */}
            <div className="flex flex-col gap-2 max-w-[50%]">
              {pieData.map((d, i) => {
                const pct = totalVol > 0 ? ((d.value / totalVol) * 100).toFixed(1) : '0.0';
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-slate-300 truncate font-bold w-16">{d.name}</span>
                    <span className="text-slate-500 font-mono w-10 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-800/50 text-[9px] font-bold text-slate-500 uppercase">
              <th className="px-4 py-2.5">Market</th>
              <th className="px-3 py-2.5">{t('trade.terms.price')}</th>
              <th className="px-3 py-2.5">Δ Avg</th>
              <th className="px-3 py-2.5">{t('trade.terms.funding')}</th>
              <th className="px-3 py-2.5">24h Vol</th>
              <th className="px-3 py-2.5 text-right">{t('trade.terms.action')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((inst, idx) => {
              const prc = prices[inst.id];
              const liq = RWA_LIQUIDITY_FALLBACK[inst.id];
              const vMeta = VENUE_CATEGORY_META[inst.venueCategory];
              const execMeta = EXECUTION_LABELS[inst.executionAvailability];
              const instPrice = prc?.priceUsd || inst.fallbackNavUsd;
              const spreadFromAvg = avgPrice > 0 ? ((instPrice - avgPrice) / avgPrice) * 100 : 0;
              const fundingDisplay = prc?.apy
                ? `${prc.apy > 0 ? '+' : ''}${prc.apy.toFixed(2)}%`
                : inst.fallbackApy > 0
                  ? `${inst.fallbackApy.toFixed(1)}%`
                  : '—';
              const vol = liq?.volume24hUsd || prc?.marketCapUsd || 0;
              const isBestPrice = idx === 0;
              const isSelected = selectedId === inst.id;

              return (
                <tr key={inst.id}
                  onClick={() => onSelectInstrument(inst)}
                  className={`cursor-pointer border-b border-slate-800/30 transition-colors ${
                    isSelected ? 'bg-blue-500/5' : 'hover:bg-slate-900/60'
                  }`}>

                  {/* Venue */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full ${
                        inst.venueCategory === 'dex_spot' ? 'bg-emerald-400' :
                        inst.venueCategory === 'onchain_perps' ? 'bg-blue-400' :
                        inst.venueCategory === 'cex_perps' ? 'bg-amber-400' :
                        'bg-purple-400'
                      }`} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-white">{inst.issuer}</p>
                          {isBestPrice && (
                            <span className="text-[7px] font-black bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded">BEST</span>
                          )}
                        </div>
                        <p className="text-[9px] text-slate-500">{vMeta.labelKr}</p>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-3">
                    <p className="text-xs font-mono font-bold text-white">{formatPrice(instPrice)}</p>
                    {prc?.change24h != null && (
                      <p className={`text-[9px] font-bold ${prc.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {prc.change24h >= 0 ? '+' : ''}{prc.change24h.toFixed(2)}%
                      </p>
                    )}
                  </td>

                  {/* Spread from avg */}
                  <td className="px-3 py-3">
                    <span className={`text-[11px] font-mono font-bold ${
                      spreadFromAvg < -0.05 ? 'text-emerald-400' :
                      spreadFromAvg > 0.05 ? 'text-red-400' :
                      'text-slate-400'
                    }`}>
                      {spreadFromAvg > 0 ? '+' : ''}{spreadFromAvg.toFixed(3)}%
                    </span>
                  </td>

                  {/* Funding/APY */}
                  <td className="px-3 py-3">
                    <p className="text-[11px] font-mono text-slate-300">{fundingDisplay}</p>
                  </td>

                  {/* Volume */}
                  <td className="px-3 py-3">
                    <p className="text-[11px] font-mono text-slate-400">{formatVolume(vol)}</p>
                  </td>

                  {/* Execution */}
                  <td className="px-3 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded ${execMeta.color}`}>
                      {inst.venueCategory === 'dex_spot' && <><Zap size={8} /> Swap</>}
                      {inst.venueCategory === 'onchain_perps' && <><Zap size={8} /> Perp</>}
                      {inst.venueCategory === 'cex_perps' && <><ExternalLink size={8} /> CEX</>}
                      {inst.venueCategory === 'platform_access' && <><ExternalLink size={8} /> Platform</>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
