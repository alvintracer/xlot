// ============================================================
// RWAMarketScanner.tsx
// Right-panel scanner table with asset-class tabs,
// structure filters, search, and sortable columns.
// ============================================================

import { useState, useMemo } from 'react';
import {
  ALL_INSTRUMENTS,
  ALL_INSTRUMENT_GROUPS,
} from '../constants/rwaInstruments';
import type { RWAInstrument, RWAInstrumentGroup, VenueCategory } from '../types/rwaInstrument';
import type { AssetClass } from '../types/rwaInstrument';
import { ASSET_CLASS_META, STRUCTURE_LABELS, EXECUTION_LABELS, VENUE_CATEGORY_META } from '../types/rwaInstrument';
import { computeConfidence } from '../services/confidenceScoringService';
import { InstrumentIcon } from '../components/InstrumentIcon';
import { Search, Filter, ArrowUpDown, Sparkles, Globe, Diamond, Zap, Building2, Link, LayoutGrid, Landmark, Gem, TrendingUp, FileText, Home } from 'lucide-react';
import type { RWAPriceMap, NAVMap } from '../services/rwaService';
import { formatApy, getChainName, getInstrumentImageUrl } from '../services/rwaService';

// ─── Scanner filter presets ──────────────────────────────────
type FilterPreset = 'all' | 'best_deals' | 'deepest_liq' | 'highest_yield' | 'executable' | 'tracked' | 'synthetic';

const PRESET_LABELS: { id: FilterPreset; label: string }[] = [
  { id: 'all',           label: 'All' },
  { id: 'best_deals',    label: 'Best Deals' },
  { id: 'highest_yield', label: 'High Yield' },
  { id: 'executable',    label: 'Executable' },
  { id: 'tracked',       label: 'Tracked Only' },
  { id: 'synthetic',     label: 'Synthetic' },
];

const VENUE_TABS: { id: VenueCategory | 'all'; label: string; icon: React.ReactNode }[] = [
  { id: 'all',              label: 'All Markets',     icon: <Globe size={13} /> },
  { id: 'dex_spot',         label: 'DEX Spot',       icon: <Diamond size={13} /> },
  { id: 'onchain_perps',    label: 'Onchain Perps',  icon: <Zap size={13} /> },
  { id: 'cex_perps',        label: 'CEX Perps',      icon: <Building2 size={13} /> },
  { id: 'platform_access',  label: 'Platform',       icon: <Link size={13} /> },
];

const ASSET_CLASS_TABS: { id: AssetClass | 'all'; label: string; icon: React.ReactNode }[] = [
  { id: 'all',         label: 'All Classes',   icon: <LayoutGrid size={13} /> },
  { id: 'treasury',    label: 'Treasuries',    icon: <Landmark size={13} /> },
  { id: 'commodity',   label: 'Commodities',   icon: <Gem size={13} /> },
  { id: 'equity',      label: 'Equities',      icon: <TrendingUp size={13} /> },
  { id: 'credit',      label: 'Credit',        icon: <FileText size={13} /> },
  { id: 'real_estate', label: 'Real Estate',   icon: <Home size={13} /> },
];

interface ScannerProps {
  prices: RWAPriceMap;
  navMap: NAVMap;
  onSelectInstrument: (inst: RWAInstrument) => void;
  selectedId: string;
}

export function RWAMarketScanner({ prices, navMap, onSelectInstrument, selectedId }: ScannerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVenue, setActiveVenue] = useState<VenueCategory | 'all'>('all');
  const [activeClass, setActiveClass] = useState<AssetClass | 'all'>('all');
  const [activePreset, setActivePreset] = useState<FilterPreset>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'spread' | 'apy' | 'confidence'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const filteredInstruments = useMemo(() => {
    let list = ALL_INSTRUMENTS;

    // Venue category filter
    if (activeVenue !== 'all') {
      list = list.filter(i => i.venueCategory === activeVenue);
    }

    // Asset class filter
    if (activeClass !== 'all') {
      list = list.filter(i => i.assetClass === activeClass);
    }

    // Preset filter
    if (activePreset === 'executable') list = list.filter(i => i.executionAvailability === 'swappable_now');
    if (activePreset === 'tracked') list = list.filter(i => i.executionAvailability === 'tracked_only' || i.executionAvailability === 'platform_only');
    if (activePreset === 'synthetic') list = list.filter(i => i.structureType === 'synthetic');
    if (activePreset === 'highest_yield') list = list.filter(i => i.fallbackApy > 0).sort((a,b) => b.fallbackApy - a.fallbackApy);
    if (activePreset === 'best_deals') {
      list = list.filter(i => {
        const nav = navMap[i.id];
        return nav && nav.isDiscount;
      });
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.symbol.toLowerCase().includes(q) ||
        i.displayName.toLowerCase().includes(q) ||
        i.issuer.toLowerCase().includes(q) ||
        i.underlyingReference.toLowerCase().includes(q) ||
        i.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'price': cmp = (prices[a.id]?.priceUsd || 0) - (prices[b.id]?.priceUsd || 0); break;
        case 'spread': cmp = (navMap[a.id]?.spreadPct || 0) - (navMap[b.id]?.spreadPct || 0); break;
        case 'apy': cmp = a.fallbackApy - b.fallbackApy; break;
        case 'confidence': cmp = computeConfidence(a).score - computeConfidence(b).score; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [activeVenue, activeClass, activePreset, searchQuery, sortBy, sortDir, prices, navMap]);

  const SortHeader = ({ col, label }: { col: typeof sortBy; label: string }) => (
    <th className="pb-3 cursor-pointer hover:text-slate-300 select-none" onClick={() => handleSort(col)}>
      <span className="flex items-center gap-1">
        {label}
        {sortBy === col && <ArrowUpDown size={10} className={sortDir === 'asc' ? 'rotate-180' : ''} />}
      </span>
    </th>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Scanner Header */}
      <div className="px-6 py-4 border-b border-slate-800 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-white">RWA Market Intelligence</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">{filteredInstruments.length} instruments · {new Set(filteredInstruments.map(i => i.assetClass)).size} asset classes</p>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Symbol, issuer, underlying..."
              className="pl-9 pr-4 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg outline-none text-white w-56 focus:border-blue-500/50 placeholder-slate-600"
            />
          </div>
        </div>

        {/* Venue Category Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {VENUE_TABS.map(tab => {
            const count = tab.id === 'all' ? ALL_INSTRUMENTS.length : ALL_INSTRUMENTS.filter(i => i.venueCategory === tab.id).length;
            return (
              <button key={tab.id} onClick={() => { setActiveVenue(tab.id); setActiveClass('all'); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                  activeVenue === tab.id
                    ? 'bg-slate-700 text-white border border-slate-600'
                    : 'bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-700'
                }`}>
                <span>{tab.icon}</span>
                {tab.label}
                <span className="text-[9px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Asset Class Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {ASSET_CLASS_TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveClass(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                activeClass === tab.id
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700'
              }`}>
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Preset Filters */}
        <div className="flex gap-1.5 overflow-x-auto">
          {PRESET_LABELS.map(p => (
            <button key={p.id} onClick={() => setActivePreset(p.id)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                activePreset === p.id
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-900 text-slate-500 hover:text-slate-300'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scanner Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead className="sticky top-0 bg-[#0a0f1e] z-10">
            <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase">
              <SortHeader col="name" label="Instrument" />
              <th className="pb-3">Structure</th>
              <SortHeader col="price" label="Market Price" />
              <th className="pb-3">NAV / Ref</th>
              <SortHeader col="spread" label="Δ NAV" />
              <SortHeader col="apy" label="APY" />
              <th className="pb-3">Execution</th>
              <SortHeader col="confidence" label="Score" />
              <th className="pb-3 text-right pr-4">Chain</th>
            </tr>
          </thead>
          <tbody>
            {filteredInstruments.length === 0 ? (
              <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-600">No instruments match current filters</td></tr>
            ) : (
              filteredInstruments.map(inst => {
                const prc = prices[inst.id];
                const nav = navMap[inst.id];
                const conf = computeConfidence(inst);
                const isSelected = selectedId === inst.id;
                const acMeta = ASSET_CLASS_META[inst.assetClass];
                const venueMeta = VENUE_CATEGORY_META[inst.venueCategory];
                const structMeta = STRUCTURE_LABELS[inst.structureType];
                const execMeta = EXECUTION_LABELS[inst.executionAvailability];

                const priceStr = prc?.priceUsd
                  ? prc.priceUsd >= 1000 ? `$${prc.priceUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}` : `$${prc.priceUsd.toFixed(4)}`
                  : inst.fallbackNavUsd >= 1000 ? `$${inst.fallbackNavUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}` : `$${inst.fallbackNavUsd.toFixed(2)}`;

                const navStr = nav?.navUsd
                  ? nav.navUsd >= 1000 ? `$${nav.navUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}` : `$${nav.navUsd.toFixed(4)}`
                  : inst.fallbackNavUsd >= 100 ? `$${inst.fallbackNavUsd.toFixed(0)}` : `$${inst.fallbackNavUsd.toFixed(2)}`;

                const confBarColor = conf.level === 'high' ? 'bg-emerald-500' : conf.level === 'medium' ? 'bg-amber-500' : 'bg-red-500';

                return (
                  <tr
                    key={inst.id}
                    onClick={() => onSelectInstrument(inst)}
                    className={`cursor-pointer border-b border-slate-800/40 transition-colors ${
                      isSelected ? 'bg-blue-500/5' : 'hover:bg-slate-900/60'
                    }`}
                  >
                    {/* Instrument */}
                    <td className="py-3 pl-2 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 shrink-0">
                          <InstrumentIcon instrument={inst} className="w-full h-full" />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-black truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>{inst.symbol}</p>
                          <div className="flex items-center gap-1">
                            <p className="text-[9px] text-slate-500 truncate">{inst.issuer}</p>
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${venueMeta.color.bg} ${venueMeta.color.text}`}>{venueMeta.label}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Structure */}
                    <td className="py-3">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border border-transparent ${structMeta.color}`}>
                        {structMeta.label}
                      </span>
                    </td>

                    {/* Price */}
                    <td className="py-3">
                      <p className="text-xs font-mono text-white">{priceStr}</p>
                      {prc?.change24h != null && (
                        <p className={`text-[9px] font-bold ${prc.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {prc.change24h >= 0 ? '+' : ''}{prc.change24h.toFixed(2)}%
                        </p>
                      )}
                    </td>

                    {/* NAV/Ref */}
                    <td className="py-3">
                      <p className="text-[11px] font-mono text-slate-400">{navStr}</p>
                      <p className="text-[8px] text-slate-600">{inst.navSupport === 'official' ? 'Official' : inst.navSupport === 'estimated' ? 'Est.' : '—'}</p>
                    </td>

                    {/* Spread */}
                    <td className="py-3">
                      {nav ? (
                        <span className={`text-[11px] font-black ${nav.isDiscount ? 'text-emerald-400' : 'text-red-400'}`}>
                          {nav.spreadPct > 0 ? '+' : ''}{nav.spreadPct.toFixed(2)}%
                        </span>
                      ) : <span className="text-[9px] text-slate-600">—</span>}
                    </td>

                    {/* APY */}
                    <td className="py-3">
                      <p className={`text-xs font-black ${inst.fallbackApy > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {inst.fallbackApy > 0 ? formatApy(inst.fallbackApy) : '—'}
                      </p>
                    </td>

                    {/* Execution */}
                    <td className="py-3">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${execMeta.color}`}>
                        {execMeta.icon} {execMeta.label}
                      </span>
                    </td>

                    {/* Confidence */}
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${confBarColor}`} style={{ width: `${conf.score}%` }} />
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">{conf.score}</span>
                      </div>
                    </td>

                    {/* Chain */}
                    <td className="py-3 text-right pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {inst.chains.length > 0 ? inst.chains.slice(0, 3).map(c => (
                          <span key={c.chainId} className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-400" title={c.chainName}>
                            {c.chainName.charAt(0)}
                          </span>
                        )) : (
                          <span className="text-[9px] text-slate-600">Off-chain</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
