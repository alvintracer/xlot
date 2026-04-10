import React from 'react';
import { Gem, Droplet, Landmark, FileText, LayoutGrid, CircleDollarSign, Blocks } from 'lucide-react';
import type { RWAInstrument } from '../types/rwaInstrument';

export const InstrumentIcon = ({ instrument, className = "w-6 h-6" }: { instrument: RWAInstrument, className?: string }) => {
  const sym = instrument.symbol.toLowerCase();
  const sub = (instrument.subCategory || '').toLowerCase();
  const ref = instrument.underlyingReference.toLowerCase();

  // Color combinations
  const GoldStyle = "bg-amber-500/20 text-amber-400 border-amber-500/40";
  const SilverStyle = "bg-slate-300/20 text-slate-300 border-slate-400/40";
  const BronzeStyle = "bg-amber-700/20 text-amber-600 border-amber-700/40";
  const OilStyle = "bg-neutral-800 text-slate-300 border-neutral-700 shadow-inner";
  const UsdStyle = "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
  const DefaultStyle = "bg-blue-500/20 text-blue-400 border-blue-500/40";

  let Icon = LayoutGrid;
  let style = DefaultStyle;

  if (sym.includes('gold') || sym === 'xauusdt' || sym === 'paxg' || sym === 'xaut' || sub.includes('gold') || ref.includes('gold') || ref.includes('xau')) {
    Icon = Gem;
    style = GoldStyle;
  } else if (sym.includes('silver') || sym === 'xagusdt' || sub.includes('silver') || ref.includes('silver') || ref.includes('xag')) {
    Icon = Gem;
    style = SilverStyle;
  } else if (sym.includes('copper') || sub.includes('copper') || ref.includes('copper')) {
    Icon = Blocks; 
    style = BronzeStyle;
  } else if (sym.includes('oil') || sym.includes('gas') || sub.includes('oil') || ref.includes('oil') || ref.includes('brent')) {
    Icon = Droplet;
    style = OilStyle;
  } else if (instrument.assetClass === 'treasury') {
    Icon = Landmark;
    style = UsdStyle;
  } else if (instrument.assetClass === 'credit') {
    Icon = FileText;
    style = DefaultStyle;
  } else {
    Icon = CircleDollarSign;
  }

  return (
    <div className={`flex items-center justify-center rounded-full border ${style} ${className}`}>
      <Icon className="w-3/5 h-3/5" />
    </div>
  );
};

export const GroupIcon = ({ groupKey, className = "w-6 h-6" }: { groupKey: string, className?: string }) => {
  if (groupKey === 'gold') {
    return <div className={`flex items-center justify-center rounded-full border bg-amber-500/20 text-amber-400 border-amber-500/40 ${className}`}><Gem className="w-3/5 h-3/5"/></div>;
  }
  if (groupKey === 'silver') {
    return <div className={`flex items-center justify-center rounded-full border bg-slate-300/20 text-slate-300 border-slate-400/40 ${className}`}><Gem className="w-3/5 h-3/5"/></div>;
  }
  if (groupKey === 'copper') {
    return <div className={`flex items-center justify-center rounded-full border bg-amber-700/20 text-amber-600 border-amber-700/40 ${className}`}><Blocks className="w-3/5 h-3/5"/></div>;
  }
  if (groupKey === 'oil') {
    return <div className={`flex items-center justify-center rounded-full border bg-neutral-800 text-slate-300 border-neutral-700 shadow-inner ${className}`}><Droplet className="w-3/5 h-3/5"/></div>;
  }
  return <div className={`flex items-center justify-center rounded-full border bg-slate-800 text-slate-400 border-slate-700 ${className}`}><LayoutGrid className="w-3/5 h-3/5"/></div>;
};
