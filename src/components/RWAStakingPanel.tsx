import React from 'react';
import { ALL_INSTRUMENT_GROUPS } from '../constants/rwaInstruments';
import { GroupIcon } from './InstrumentIcon';
import { STRUCTURE_LABELS, ASSET_CLASS_META } from '../types/rwaInstrument';
import { Layers, Zap, Shield, ArrowRight } from 'lucide-react';

export function RWAStakingPanel() {
  const mockPools = [
    {
      groupKey: 'gold',
      title: 'Global Gold Vault',
      description: 'Unified single-sided staking for PAXG, XAUt, and CEX Gold Perps. Earn cross-market arbitrage yields.',
      tvl: 14500200,
      apy: 8.5,
      tokens: ['PAXG', 'XAUt', 'XAUUSDT']
    },
    {
      groupKey: 'silver',
      title: 'Silver Yield Pool',
      description: 'Liquidity provisioning for Silver spot and perpetual markets.',
      tvl: 2305000,
      apy: 12.2,
      tokens: ['KAG', 'XAGUSDT']
    },
    {
      groupKey: 'treasury',
      title: 'T-Bill Delta-Neutral',
      description: 'Auto-compounding treasury basket utilizing Ondo and Franklin Templeton instruments.',
      tvl: 45000000,
      apy: 5.4,
      tokens: ['USDY', 'OUSG', 'BENJI']
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-28 lg:p-8 lg:pb-32 custom-scrollbar bg-[#020617]">
      <div className="max-w-5xl mx-auto space-y-6 lg:space-y-8">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 lg:gap-0">
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight">RWA Yield Vaults <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full align-top ml-2 lowercase tracking-widest">Coming Soon</span></h1>
            <p className="text-xs lg:text-sm text-slate-400 mt-1">Cross-market unified pools. Stake overlapping assets to generate aggregator route yields.</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Total Value Locked</p>
              <p className="text-lg font-black text-emerald-400">$61.8M</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Avg Pool APY</p>
              <p className="text-lg font-black text-blue-400">8.7%</p>
            </div>
          </div>
        </div>

        {/* Feature Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#050914] border border-slate-800 rounded-2xl p-4 lg:p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Layers size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-white mb-0.5">Asset Unification</p>
              <p className="text-[10px] text-slate-500">Provide liquidity across identical underlying assets globally.</p>
            </div>
          </div>
          <div className="bg-[#050914] border border-slate-800 rounded-2xl p-4 lg:p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Zap size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-white mb-0.5">Arbitrage Yield</p>
              <p className="text-[10px] text-slate-500">Earn from the aggregator's cross-venue routing algorithms.</p>
            </div>
          </div>
          <div className="bg-[#050914] border border-slate-800 rounded-2xl p-4 lg:p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <Shield size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-white mb-0.5">Delta-Neutral</p>
              <p className="text-[10px] text-slate-500">Fully hedged vault positions to eliminate price exposure.</p>
            </div>
          </div>
        </div>

        {/* Vaults Grid */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Available Vaults</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
            {mockPools.map((pool, i) => (
              <div key={i} className="bg-gradient-to-b from-[#0a0f1e] to-[#050914] border border-slate-800 hover:border-slate-700 transition-all rounded-2xl lg:rounded-3xl p-5 lg:p-6 group cursor-not-allowed">
                
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <GroupIcon groupKey={pool.groupKey} className="w-12 h-12" />
                    <div>
                      <h4 className="text-base font-black text-white group-hover:text-blue-400 transition-colors">{pool.title}</h4>
                      <div className="flex gap-1.5 mt-1">
                        {pool.tokens.map(t => (
                          <span key={t} className="text-[9px] font-bold bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Target APY</p>
                    <p className="text-xl font-black text-emerald-400">{pool.apy}%</p>
                  </div>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed mb-6 h-10">{pool.description}</p>

                <div className="flex items-center justify-between pt-5 border-t border-slate-800">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Vault TVL</p>
                    <p className="text-sm font-mono text-white">${pool.tvl.toLocaleString()}</p>
                  </div>
                  <button className="flex items-center gap-2 bg-slate-800 text-slate-400 font-bold text-xs px-4 py-2 rounded-xl group-hover:bg-slate-700 transition-colors" disabled>
                    View Details <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
