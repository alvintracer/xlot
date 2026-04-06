// ============================================================
// Injective Execution Provider
// Provides swap quotes for Injective derivative markets.
//
// Strategy: Try Indexer REST API first, then fall back to
// oracle-based price estimation for robust quotes.
// ============================================================

import type { ExecutionProvider, ExecutionQuote } from '../types';
import type { RWAInstrument } from '../../../types/rwaInstrument';
import { INJ_MARKET_IDS } from '../market/injectiveProvider';

const INJECTIVE_INDEXER_BASE = import.meta.env.VITE_INJECTIVE_INDEXER_BASE || 'https://sentry.lcd.injective.network';

export const InjectiveExecutionProvider: ExecutionProvider = {
  name: 'Injective DEX',
  supportedChainIds: [888],
  isLive: true,

  async getQuote(params): Promise<ExecutionQuote> {
    const { instrument, amountWei, fromDecimals, toDecimals, slippagePct } = params;

    // Resolve market ID from symbol
    const marketId = INJ_MARKET_IDS[instrument.symbol];
    if (!marketId) {
      throw new Error(`No Injective market ID for ${instrument.symbol}`);
    }

    const inputUsd = Number(amountWei) / 10 ** fromDecimals;
    
    // Strategy 1: Try live orderbook from Indexer
    let totalTokens = 0;
    let avgFillPrice = 0;
    let priceImpact = 0;
    let usedLiveData = false;

    try {
      // Use the Chronos market summary endpoint for price data (more reliable)
      const summaryUrl = `${INJECTIVE_INDEXER_BASE}/api/chronos/v1/derivative/market_summary?marketId=${marketId}`;
      const res = await fetch(summaryUrl, { signal: AbortSignal.timeout(5000) });
      
      if (res.ok) {
        const data = await res.json();
        const livePrice = parseFloat(data?.price || '0');
        
        if (livePrice > 0) {
          totalTokens = inputUsd / livePrice;
          avgFillPrice = livePrice;
          // Estimate price impact based on typical Injective derivative liquidity
          priceImpact = inputUsd > 10000 ? 0.15 : inputUsd > 1000 ? 0.05 : 0.02;
          usedLiveData = true;
        }
      }
    } catch (e) {
      console.warn('[InjectiveExec] Indexer summary failed, using fallback:', e);
    }

    // Strategy 2: Fall back to oracle reference / fallback price
    if (!usedLiveData) {
      const fallbackPrice = instrument.fallbackNavUsd;
      if (fallbackPrice <= 0) {
        throw new Error('No price available for Injective market');
      }
      totalTokens = inputUsd / fallbackPrice;
      avgFillPrice = fallbackPrice;
      priceImpact = 0.1; // Conservative estimate for fallback
    }

    if (totalTokens <= 0) {
      throw new Error('Insufficient liquidity in Injective market');
    }

    // Apply slippage tolerance
    const slippageMultiplier = 1 - (slippagePct / 100);
    const adjustedTokens = totalTokens * slippageMultiplier;

    return {
      provider: 'Injective DEX',
      toAmount: Math.floor(adjustedTokens * 10 ** toDecimals).toString(),
      toAmountDisplay: adjustedTokens.toFixed(toDecimals > 6 ? 6 : toDecimals),
      estimatedGasUsd: 0.02, // Injective has very low gas (~0.01-0.03 USD)
      priceImpact: Math.abs(priceImpact),
      route: [{ 
        name: usedLiveData ? 'Injective DEX (Live)' : 'Injective DEX (Est.)', 
        part: 100 
      }],
      score: 0, // Computed by rwaExecutionProvider
    };
  },
};
