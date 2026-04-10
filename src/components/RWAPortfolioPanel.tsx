import React from 'react';
import { ALL_INSTRUMENTS } from '../constants/rwaInstruments';
import { InstrumentIcon } from './InstrumentIcon';
import { STRUCTURE_LABELS, VENUE_CATEGORY_META, ASSET_CLASS_META } from '../types/rwaInstrument';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export function RWAPortfolioPanel() {
  const mockHoldings = [
    { instId: 'usdy', balance: 5420.50, avgPrice: 1.02, apy: 5.1 },
    { instId: 'paxg', balance: 1.25, avgPrice: 1950.00, apy: 0.0 }, // Gold spot
    { instId: 'xauusdt-bybit', balance: 2.5, avgPrice: 2010.50, apy: 8.5 }, // Gold perp
    { instId: 'ousg', balance: 104.2, avgPrice: 102.10, apy: 5.3 },
    { instId: 'xagusdt-hyperliquid', balance: 150.0, avgPrice: 22.50, apy: 12.5 }
  ];

  const holdingsWithMeta = mockHoldings.map(h => {
    const inst = ALL_INSTRUMENTS.find(i => i.id === h.instId);
    return { ...h, inst };
  }).filter(h => h.inst) as (typeof mockHoldings[0] & { inst: typeof ALL_INSTRUMENTS[0] })[];

  let totalCurrentValue = 0;
  let totalPurchaseValue = 0;
  let totalAnnualYield = 0;

  // Acc arrays for pie charts
  const classMap: Record<string, number> = {};
  const venueMap: Record<string, number> = {};
  const assetMap: Record<string, number> = {};

  holdingsWithMeta.forEach(h => {
    const currentPrice = h.inst.fallbackNavUsd || h.avgPrice;
    const currentVal = h.balance * currentPrice;
    const purchaseVal = h.balance * h.avgPrice;
    
    totalCurrentValue += currentVal;
    totalPurchaseValue += purchaseVal;
    totalAnnualYield += currentVal * (h.apy / 100);

    // Group Class
    const cls = h.inst.assetClass;
    classMap[cls] = (classMap[cls] || 0) + currentVal;

    // Group Venue
    const ven = h.inst.venueCategory;
    venueMap[ven] = (venueMap[ven] || 0) + currentVal;

    // Group Asset
    const sym = h.inst.symbol;
    assetMap[sym] = (assetMap[sym] || 0) + currentVal;
  });

  const netPnL = totalCurrentValue - totalPurchaseValue;
  const netPnLPct = totalPurchaseValue > 0 ? (netPnL / totalPurchaseValue) * 100 : 0;
  const avgApy = totalCurrentValue > 0 ? (totalAnnualYield / totalCurrentValue) * 100 : 0;

  const pieClassData = Object.entries(classMap).map(([cls, val]) => ({
    name: ASSET_CLASS_META[cls as keyof typeof ASSET_CLASS_META]?.label || cls,
    value: val,
    color: cls === 'treasury' ? '#10b981' : cls === 'commodity' ? '#f59e0b' : '#3b82f6'
  }));

  const venuePalette: Record<string, string> = {
    dex_spot: '#34d399',
    onchain_perps: '#60a5fa',
    cex_perps: '#fbbf24',
    platform_access: '#c084fc'
  };

  const pieVenueData = Object.entries(venueMap).map(([ven, val]) => ({
    name: VENUE_CATEGORY_META[ven as keyof typeof VENUE_CATEGORY_META]?.label || ven,
    value: val,
    color: venuePalette[ven] || '#94a3b8'
  }));

  const assetColors = ['#ec4899', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
  const pieAssetData = Object.entries(assetMap).sort((a,b) => b[1] - a[1]).map(([sym, val], idx) => ({
    name: sym,
    value: val,
    color: assetColors[idx % assetColors.length]
  }));

  const formatUsd = (val: number) => '$' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const renderTooltip = (val: any) => [formatUsd(Number(val)), 'Value'];

  const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percent < 0.05) return null; // hide very small labels
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-28 lg:p-8 lg:pb-32 custom-scrollbar bg-[#020617]">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* ── Top Header and Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
           <div className="col-span-2 lg:col-span-1 flex items-end mb-2 lg:mb-0">
            <div>
              <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight">Portfolio</h1>
              <p className="text-xs text-slate-400 mt-1">Unified RWA Holdings</p>
            </div>
          </div>
          <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-5">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Total Net Worth</p>
            <p className="text-2xl font-black text-white">{formatUsd(totalCurrentValue)}</p>
            <p className="text-xs text-slate-400 mt-1">Init: {formatUsd(totalPurchaseValue)}</p>
          </div>
          <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Total PnL</p>
            <p className={`text-2xl font-black ${netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netPnL >= 0 ? '+' : ''}{formatUsd(netPnL)}
            </p>
            <p className={`text-xs font-bold mt-1 ${netPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {netPnL >= 0 ? '+' : ''}{netPnLPct.toFixed(2)}%
            </p>
          </div>
          <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Blended Yield (APY)</p>
            <p className="text-2xl font-black text-blue-400">{avgApy.toFixed(2)}%</p>
            <p className="text-xs text-slate-400 mt-1">Est. Yearly: {formatUsd(totalAnnualYield)}</p>
          </div>
        </div>

        {/* ── Mid Row: Two Small Pies (Class & Market) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          
          <div className="bg-[#0a0f1e] border border-slate-800 rounded-2xl p-4 lg:p-6 flex flex-col">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 lg:mb-6">Asset Class Allocation</h3>
            <div className="flex-1 flex flex-col lg:flex-row items-center gap-4 lg:gap-0">
              <div className="h-[120px] lg:h-[160px] w-full lg:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieClassData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} stroke="none" paddingAngle={2} dataKey="value" labelLine={false} label={CustomPieLabel}>
                      {pieClassData.map((e, i) => <Cell key={`cell-${i}`} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '11px' }} itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }} formatter={renderTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 pl-6 space-y-4">
                {pieClassData.map((d, i) => (
                  <div key={i} className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-slate-300 font-bold">{d.name}</span>
                      </div>
                      <span className="text-slate-400 font-mono">{((d.value / totalCurrentValue) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-[#0a0f1e] border border-slate-800 rounded-2xl p-4 lg:p-6 flex flex-col">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 lg:mb-6">Market Venue Allocation</h3>
            <div className="flex-1 flex flex-col lg:flex-row items-center gap-4 lg:gap-0">
              <div className="h-[120px] lg:h-[160px] w-full lg:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieVenueData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} stroke="none" paddingAngle={2} dataKey="value" labelLine={false} label={CustomPieLabel}>
                      {pieVenueData.map((e, i) => <Cell key={`cell-${i}`} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '11px' }} itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }} formatter={renderTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 pl-6 space-y-4">
                {pieVenueData.map((d, i) => (
                  <div key={i} className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-slate-300 font-bold">{d.name}</span>
                      </div>
                      <span className="text-slate-400 font-mono">{((d.value / totalCurrentValue) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* ── Bottom Row: Large Individual Asset Pie & Table ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <div className="col-span-1 bg-[#0a0f1e] border border-slate-800 rounded-2xl p-4 lg:p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 lg:mb-6">Individual Asset Dominance</h3>
            <div className="h-[200px] lg:h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieAssetData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} stroke="none" paddingAngle={2} dataKey="value" labelLine={false} label={CustomPieLabel}>
                    {pieAssetData.map((e, i) => <Cell key={`cell-${i}`} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '11px' }} itemStyle={{ color: '#f8fafc', fontWeight: 'bold' }} formatter={renderTooltip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 mt-6">
              {pieAssetData.slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-slate-300 font-bold truncate max-w-[120px]">{d.name}</span>
                  </div>
                  <span className="text-slate-400 font-mono">{((d.value / totalCurrentValue) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-1 lg:col-span-2 bg-[#0a0f1e] border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 lg:px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Holdings Details</h3>
            </div>
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#050914] sticky top-0">
                  <tr className="border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase">
                    <th className="px-5 py-3">Asset</th>
                    <th className="px-5 py-3 text-right">Balance</th>
                    <th className="px-5 py-3 text-right">Entry / Current px</th>
                    <th className="px-5 py-3 text-right">Yield</th>
                    <th className="px-5 py-3 text-right">Unrealized PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingsWithMeta.sort((a,b) => (b.balance*(b.inst.fallbackNavUsd||b.avgPrice)) - (a.balance*(a.inst.fallbackNavUsd||a.avgPrice))).map((h, i) => {
                    const price = h.inst.fallbackNavUsd || h.avgPrice;
                    const val = h.balance * price;
                    const pnlUsd = (price - h.avgPrice) * h.balance;
                    const pnlPct = h.avgPrice > 0 ? ((price - h.avgPrice) / h.avgPrice) * 100 : 0;
                    
                    return (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 shrink-0">
                              <InstrumentIcon instrument={h.inst} className="w-full h-full" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-white">{h.inst.symbol}</p>
                              <div className="flex gap-1.5 mt-0.5">
                                <span className="text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded">{VENUE_CATEGORY_META[h.inst.venueCategory]?.label}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="text-sm font-mono font-bold text-white">{h.balance.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-500 font-mono">${val.toLocaleString(undefined, {maximumFractionDigits:0})}</p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="text-xs font-mono font-bold text-slate-400">${h.avgPrice.toLocaleString(undefined, {maximumFractionDigits:2})}</p>
                          <p className="text-xs font-mono font-bold text-white mt-0.5">Avg: ${price.toLocaleString(undefined, {maximumFractionDigits:2})}</p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className="text-xs font-mono font-black text-blue-400">{h.apy > 0 ? '+' : ''}{h.apy.toFixed(1)}%</p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <p className={`text-sm font-mono font-black ${pnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnlUsd >= 0 ? '+' : ''}${Math.abs(pnlUsd).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                          </p>
                          <p className={`text-[10px] font-mono font-bold mt-0.5 ${pnlPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
