import React, { useState, useEffect, useCallback } from 'react';
import type { RWAInstrument } from '../types/rwaInstrument';
import { useActiveAccount } from 'thirdweb/react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { RWAPriceMap } from '../services/rwaService';
import { VAULT_CONTRACT_ADDRESS, USDC_ETH_ADDRESS, USDC_DECIMALS, VAULT_ABI } from '../constants/vaultContract';

const RELAY_URL = 'http://49.247.139.241:3000';

// Minimal USDC ABI for balance + permit
const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function nonces(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function version() view returns (string)',
];

interface ProxyBrokerModalProps {
  instrument: RWAInstrument;
  prices: RWAPriceMap;
  walletAddress?: string;
  onClose: () => void;
}

export const ProxyBrokerModal: React.FC<ProxyBrokerModalProps> = ({
  instrument,
  prices,
  walletAddress,
  onClose
}) => {
  const { t } = useTranslation();
  const account = useActiveAccount();
  const [depositAmount, setDepositAmount] = useState('');
  const [orderSize, setOrderSize] = useState('');
  const [leverage, setLeverage] = useState<number>(5);
  const [orderSide, setOrderSide] = useState<'long' | 'short'>('long');
  const [isProcessing, setIsProcessing] = useState(false);

  // ── 실제 온체인 잔고 ──
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [isLoadingBalances, setIsLoadingBalances] = useState(true);

  const addr = walletAddress || account?.address;

  // ── 잔고 조회 (Vault + USDC 지갑) ──
  const fetchBalances = useCallback(async () => {
    if (!addr) return;
    setIsLoadingBalances(true);
    try {
      const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
      
      // Vault 잔고
      if (VAULT_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000') {
        const vault = new ethers.Contract(VAULT_CONTRACT_ADDRESS, VAULT_ABI, provider);
        const bal = await vault.getBalance(addr, USDC_ETH_ADDRESS);
        setVaultBalance(Number(ethers.formatUnits(bal, USDC_DECIMALS)));
      }

      // 지갑 USDC 잔고
      const usdc = new ethers.Contract(USDC_ETH_ADDRESS, USDC_ABI, provider);
      const walletBal = await usdc.balanceOf(addr);
      setUsdcBalance(Number(ethers.formatUnits(walletBal, USDC_DECIMALS)));
    } catch (e) {
      console.error('[ProxyBrokerModal] balance fetch error:', e);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [addr]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // ── 입금 핸들러 ──
  const handleDeposit = async () => {
    if (!account) return toast.error('Wallet connection required.');
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) return toast.error('Please enter amount.');
    if (amount > usdcBalance) return toast.error('Insufficient USDC balance.');

    if (VAULT_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      return toast.error('Vault contract not deployed yet.');
    }

    setIsProcessing(true);
    const toastId = toast.loading('Processing USDC deposit...');

    try {
      // 실제 배포 후 여기에 permit + deposit 로직 연결
      // 현재는 시뮬레이션
      toast.success(`Deposit request for ${depositAmount} USDC prepared.\n(Will activate after deployment)`, { id: toastId });
      setDepositAmount('');
      await fetchBalances();
    } catch (e) {
      console.error(e);
      toast.error('Error occurred during deposit.', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── 대리 주문 핸들러 ──
  const handleExecuteProxyOrder = async () => {
    if (!account) return toast.error('Wallet connection required.');
    const size = Number(orderSize);
    if (!size || size <= 0) return toast.error('Please enter order size.');
    if (size > vaultBalance * leverage) {
      return toast.error('Vault balance and leverage limit exceeded.');
    }

    setIsProcessing(true);
    const toastId = toast.loading('Submitting proxy order...');

    try {
      const res = await fetch(`${RELAY_URL}/api/broker/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: account.address,
          instrumentId: instrument.id,
          side: orderSide,
          size: orderSize,
          leverage,
          symbol: instrument.symbol,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(
          `${orderSide.toUpperCase()} ${orderSize} USD order complete!\nOrder ID: ${data.orderId || 'N/A'}`,
          { id: toastId, duration: 5000 }
        );
        onClose();
      } else {
        toast.error(data.error || 'Failed to execute order.', { id: toastId });
      }
    } catch (e) {
      console.error(e);
      toast.error('Cannot connect to order server.', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1C1C28] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-white/5">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">{instrument.displayName}</h2>
            <p className="text-sm text-gray-400 mt-1">Traverse Proxy DEX (Omnibus Broker)</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6 custom-scrollbar">
          
          {/* Market Stats */}
          {prices && prices[instrument.id] && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#252536] p-3 rounded-xl border border-white/5">
                <div className="text-xs text-gray-400 mb-1">{t('trade.terms.mark_price')}</div>
                <div className="text-lg font-mono font-semibold text-white">
                  ${prices[instrument.id].priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div className="bg-[#252536] p-3 rounded-xl border border-white/5">
                <div className="text-xs text-gray-400 mb-1">{t('trade.terms.change_24h')}</div>
                <div className={`text-lg font-mono font-semibold ${prices[instrument.id].change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {prices[instrument.id].change24h > 0 ? '+' : ''}{prices[instrument.id].change24h.toFixed(2)}%
                </div>
              </div>
            </div>
          )}

          {/* Vault Deposit UI */}
          <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-300">My Proxy Vault Balance</span>
              {isLoadingBalances ? (
                <span className="text-sm text-gray-500 animate-pulse">Loading...</span>
              ) : (
                <span className="text-lg font-bold text-indigo-400 font-mono">${vaultBalance.toFixed(2)}</span>
              )}
            </div>
            <div className="text-[11px] text-gray-500 mb-3">
              My Wallet USDC: {isLoadingBalances ? '...' : `$${usdcBalance.toFixed(2)}`}
            </div>
            
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="USDC Amount to deposit"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-gray-500 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                onClick={handleDeposit}
                disabled={isProcessing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('trade.actions.deposit')}
              </button>
            </div>
          </div>

          <div className="h-px bg-white/5 w-full"></div>

          {/* Trade UI */}
          <div className="space-y-4">
            <h3 className="text-md font-semibold text-white">Proxy Order Entry</h3>
            
            {/* Long / Short Toggle */}
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 gap-1">
              <button
                className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex justify-center items-center gap-1.5 ${orderSide === 'long' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                onClick={() => setOrderSide('long')}
              >
                <ArrowUpCircle className="w-4 h-4" /> Long
              </button>
              <button
                className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all flex justify-center items-center gap-1.5 ${orderSide === 'short' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                onClick={() => setOrderSide('short')}
              >
                <ArrowDownCircle className="w-4 h-4" /> Short
              </button>
            </div>

            {/* Size & Leverage */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{t('trade.terms.order_size')}</span>
                  <span>Max: ${(vaultBalance * leverage).toFixed(2)}</span>
                </div>
                <input
                  type="number"
                  placeholder="0.00"
                  value={orderSize}
                  onChange={(e) => setOrderSize(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xl placeholder-gray-600 font-mono focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>

              <div>
                <div className="text-xs text-gray-400 mb-2">{t('trade.terms.leverage')}: {leverage}x</div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1 font-mono">
                  <span>1x</span>
                  <span>20x</span>
                </div>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleExecuteProxyOrder}
              disabled={isProcessing || !orderSize || vaultBalance <= 0}
              className={`w-full py-4 mt-2 font-bold text-white rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                orderSide === 'long' 
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400' 
                  : 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400'
              }`}
            >
              {isProcessing ? t('trade.actions.processing') 
                : vaultBalance <= 0 ? t('trade.actions.deposit_first')
                : `${t('trade.actions.entry')} ${orderSide.toUpperCase()}`}
            </button>
            
            <div className="flex items-start gap-2 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
              <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-amber-500/80 leading-relaxed">
                {t('trade.disclaimers.proxy_warning')}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
