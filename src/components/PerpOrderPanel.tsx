// ============================================================
// PerpOrderPanel.tsx — Perpetual Futures Order Panel
// Renders a professional perp trading UI for onchain_perps venues
// (Hyperliquid, edgeX, lighter.xyz)
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import type { RWAInstrument } from '../types/rwaInstrument';
import type { RWAPriceMap } from '../services/rwaService';
import { VENUE_CATEGORY_META, STRUCTURE_LABELS } from '../types/rwaInstrument';
import { RWA_LIQUIDITY_FALLBACK } from '../services/rwaService';
import {
  TrendingUp, TrendingDown, AlertTriangle,
  Zap, ChevronDown, Info, X, DollarSign, Percent
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PerpOrderPanelProps {
  instrument: RWAInstrument;
  prices: RWAPriceMap;
  onClose: () => void;
  walletAddress?: string;
}

export function PerpOrderPanel({ instrument, prices, onClose, walletAddress }: PerpOrderPanelProps) {
  const { t } = useTranslation();
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [amount, setAmount] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [leverage, setLeverage] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const price = prices[instrument.id];
  const markPx = price?.priceUsd || instrument.fallbackNavUsd;
  const fundingRate = price?.apy || 0;
  const volume24h = RWA_LIQUIDITY_FALLBACK[instrument.id]?.volume24hUsd || 0;
  const openInterest = RWA_LIQUIDITY_FALLBACK[instrument.id]?.liquidityUsd || 0;
  const venueMeta = VENUE_CATEGORY_META[instrument.venueCategory];

  // Estimate liquidation price
  const amountNum = parseFloat(amount) || 0;
  const margin = amountNum > 0 ? amountNum / leverage : 0;
  const liquidationPrice = useMemo(() => {
    if (amountNum <= 0 || leverage <= 1) return null;
    const maintenanceMarginRatio = 0.005; // 0.5%
    if (side === 'long') {
      return markPx * (1 - (1 / leverage) + maintenanceMarginRatio);
    } else {
      return markPx * (1 + (1 / leverage) - maintenanceMarginRatio);
    }
  }, [markPx, leverage, side, amountNum]);

  // Estimate fee (assuming 0.02% taker)
  const estimatedFee = amountNum * 0.0002;

  const leverageOptions = [1, 2, 3, 5, 10, 20];

  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(6)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0a0f1e] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-[#0a0f1e] border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${venueMeta.color.bg} border ${venueMeta.color.border} flex items-center justify-center text-lg`}>
                {venueMeta.icon}
              </div>
              <div>
                <h2 className="text-sm font-black text-white">{instrument.symbol}</h2>
                <p className="text-[10px] text-slate-500">{instrument.issuer} · {venueMeta.label}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 transition-colors">
              <X size={16} className="text-slate-400" />
            </button>
          </div>

          {/* Price row */}
          <div className="flex items-end gap-4 mt-3">
            <div>
              <p className="text-[9px] text-slate-500 font-bold uppercase">{t('trade.terms.mark_price')}</p>
              <p className="text-xl font-black text-white font-mono">{formatPrice(markPx)}</p>
            </div>
            {price?.change24h != null && (
              <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${price.change24h >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {price.change24h >= 0 ? '+' : ''}{price.change24h.toFixed(2)}%
              </div>
            )}
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-slate-900/50 rounded-lg px-2.5 py-1.5">
              <p className="text-[8px] text-slate-500 font-bold">Funding (Ann.)</p>
              <p className={`text-[11px] font-mono font-bold ${fundingRate > 0 ? 'text-emerald-400' : fundingRate < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                {fundingRate > 0 ? '+' : ''}{fundingRate.toFixed(2)}%
              </p>
            </div>
            <div className="bg-slate-900/50 rounded-lg px-2.5 py-1.5">
              <p className="text-[8px] text-slate-500 font-bold">24h Volume</p>
              <p className="text-[11px] font-mono text-slate-300">
                ${volume24h >= 1_000_000 ? `${(volume24h / 1_000_000).toFixed(1)}M` : `${(volume24h / 1_000).toFixed(0)}K`}
              </p>
            </div>
            <div className="bg-slate-900/50 rounded-lg px-2.5 py-1.5">
              <p className="text-[8px] text-slate-500 font-bold">Open Interest</p>
              <p className="text-[11px] font-mono text-slate-300">
                ${openInterest >= 1_000_000 ? `${(openInterest / 1_000_000).toFixed(1)}M` : `${(openInterest / 1_000).toFixed(0)}K`}
              </p>
            </div>
          </div>
        </div>

        {/* Order Form */}
        <div className="p-5 space-y-4">

          {/* Side selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide('long')}
              className={`py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
                side === 'long'
                  ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                  : 'bg-slate-900 text-slate-500 border-2 border-transparent hover:border-slate-700'
              }`}>
              <TrendingUp size={14} /> Long
            </button>
            <button
              onClick={() => setSide('short')}
              className={`py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
                side === 'short'
                  ? 'bg-red-500/20 text-red-400 border-2 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                  : 'bg-slate-900 text-slate-500 border-2 border-transparent hover:border-slate-700'
              }`}>
              <TrendingDown size={14} /> Short
            </button>
          </div>

          {/* Order type */}
          <div className="flex gap-2">
            {(['market', 'limit'] as const).map(t => (
              <button key={t} onClick={() => setOrderType(t)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  orderType === t
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-900 text-slate-500 hover:text-slate-300'
                }`}>
                {t === 'market' ? 'Market' : 'Limit'}
              </button>
            ))}
          </div>

          {/* Limit price */}
          {orderType === 'limit' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 focus-within:border-blue-500/50 transition-colors">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-slate-500 font-bold">Limit Price</span>
                <button onClick={() => setLimitPrice(markPx.toFixed(2))}
                  className="text-[9px] text-blue-400 hover:text-blue-300 font-bold">Mark Price</button>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-slate-600" />
                <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                  placeholder={markPx.toFixed(2)}
                  className="flex-1 bg-transparent text-lg font-black text-white outline-none placeholder-slate-700 font-mono" />
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 focus-within:border-blue-500/50 transition-colors">
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-slate-500 font-bold">{t('trade.terms.order_size')}</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-slate-600" />
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-lg font-black text-white outline-none placeholder-slate-700 font-mono" />
            </div>
          </div>

          {/* Leverage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-500 font-bold">{t('trade.terms.leverage')}</span>
              <span className="text-xs font-mono font-black text-white">{leverage}x</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {leverageOptions.map(lev => (
                <button key={lev} onClick={() => setLeverage(lev)}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    leverage === lev
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                      : 'bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-700'
                  }`}>
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* Estimates */}
          {amountNum > 0 && (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-3 space-y-1.5">
              {liquidationPrice && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">{t('trade.terms.liq_price')}</span>
                  <span className="font-mono text-amber-400">{formatPrice(liquidationPrice)}</span>
                </div>
              )}
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">{t('trade.terms.margin')}</span>
                <span className="font-mono text-white">${margin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">{t('trade.terms.est_fee')}</span>
                <span className="font-mono text-slate-300">${estimatedFee.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Execute button */}
          <button
            disabled={amountNum <= 0 || !walletAddress}
            className={`w-full py-3.5 rounded-xl font-black text-sm transition-all shadow-lg ${
              side === 'long'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-slate-800 disabled:text-slate-600 shadow-emerald-500/10'
                : 'bg-red-600 hover:bg-red-500 text-white disabled:bg-slate-800 disabled:text-slate-600 shadow-red-500/10'
            }`}>
            {!walletAddress
              ? t('trade.actions.connect')
              : amountNum <= 0
                ? t('trade.actions.enter_size')
                : `${side === 'long' ? 'Long' : 'Short'} ${instrument.symbol} — $${amountNum.toLocaleString()}`}
          </button>

          {/* Disclosure */}
          <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5">
            <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-400/80 leading-relaxed">
              {t('trade.disclaimers.perp_warning')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
