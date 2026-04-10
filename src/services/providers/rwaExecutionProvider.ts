// src/services/providers/rwaExecutionProvider.ts
import { get1inchQuote, get0xQuote, getJupiterQuote, getOdosQuote } from '../swapService';
import type { SwapQuote } from '../swapService';
import type { RWAAsset } from '../../constants/rwaAssets';
import type { RWAInstrument } from '../../types/rwaInstrument';
import { InjectiveExecutionProvider } from './execution/injectiveExecutionProvider';
import { HyperliquidExecutionProvider } from './execution/hyperliquidExecutionProvider';
import { LighterExecutionProvider } from './execution/lighterExecutionProvider';
import { EdgeXExecutionProvider } from './execution/edgexExecutionProvider';
import { ALL_INSTRUMENTS, instrumentToLegacyAsset } from '../../constants/rwaInstruments';
import type { ExecutionProvider, ExecutionQuote, PlaceOrderRequest, OrderPlacementResult } from './types';

export interface RouteOption extends SwapQuote {
  providerName: string;
  executionScore: number;
  scoreBreakdown: {
    baseOutput: number;
    priceImpactPenalty: number;
    gasPenalty: number;
    navDiscountBonus: number;
  };
  navSpread: number;
  gasCostUsd: number;
  warnings: string[];
}

// ─── Ranking Logic Explanation ─────────────
// The executionScore is a weighted formula evaluating route quality.
// 1. Output Value Score: Highest weight. Higher `toAmount` ranks higher.
// 2. Price Impact Penalty: Subtract points for higher price impact.
// 3. Gas Cost Penalty: Subtract points for expensive routes.
// 4. NAV Discount Bonus: Reward routes where DEX price is cheaper than NAV.
// 5. Liquidity Depth Bonus: Reward pools with higher liquidity/lower slippage risk.
// ──────────────────────────────────────────

export async function getBestRWAExecution(
  asset: RWAAsset,
  fromAmount: string,     // in human readable e.g. "100" USDC
  fromDecimals: number,
  toDecimals: number,
  walletAddress: string,
  navUsd: number | null,
  slippagePct = 0.5
): Promise<RouteOption[]> {
  const amountWei = Math.floor(parseFloat(fromAmount || '0') * 10 ** fromDecimals).toString();
  if (amountWei === '0' || isNaN(Number(amountWei))) return [];

  const promises: Promise<RouteOption | null>[] = [];
  
  // Basic check for solana chain ids (solana mainnet is sometimes 101 or 501 or 111111)
  const isSolana = asset.chainId === 101 || asset.chainId === 501 || asset.chainId === 111111 || asset.chainId === 0;
  const isInjective = asset.chainId === 888;

  if (isInjective) {
    // Injective synthetic markets — query Injective DEX orderbook
    const instrument = ALL_INSTRUMENTS.find(i => i.chains.some(c => c.chainId === 888 && c.contractAddress === asset.contractAddress));
    if (instrument) {
      promises.push(
        InjectiveExecutionProvider.getQuote({
          instrument,
          chainId: 888,
          fromAddress: asset.buyWithAddress,
          toAddress: asset.contractAddress,
          amountWei: amountWei,
          fromDecimals,
          toDecimals,
          walletAddress,
          slippagePct,
        })
          .then(eq => {
            const outputTokens = parseFloat(eq.toAmountDisplay);
            const effectivePrice = outputTokens > 0 ? parseFloat(fromAmount) / outputTokens : Infinity;
            let navSpreadVal = 0;
            if (navUsd && navUsd > 0 && effectivePrice !== Infinity) {
              navSpreadVal = ((effectivePrice - navUsd) / navUsd) * 100;
            }
            const baseOutput = Math.floor(outputTokens * 10);
            const priceImpactPenalty = Math.floor((eq.priceImpact || 0) * 50);
            const gasPenalty = Math.floor(eq.estimatedGasUsd * 2);
            const navDiscountBonus = Math.floor(navSpreadVal * -20);
            const totalScore = 1000 + baseOutput - priceImpactPenalty - gasPenalty + navDiscountBonus;

            return {
              provider: 'Injective DEX',
              fromToken: { symbol: 'USDT', address: asset.buyWithAddress, decimals: fromDecimals },
              toToken: { symbol: asset.contractAddress, address: asset.contractAddress, decimals: toDecimals },
              fromAmount: amountWei,
              toAmount: eq.toAmount,
              toAmountDisplay: eq.toAmountDisplay,
              estimatedGasUsd: eq.estimatedGasUsd,
              priceImpact: eq.priceImpact,
              route: eq.route,
              providerName: 'Injective DEX',
              executionScore: Math.floor(totalScore),
              scoreBreakdown: {
                baseOutput,
                priceImpactPenalty: -priceImpactPenalty,
                gasPenalty: -gasPenalty,
                navDiscountBonus,
              },
              navSpread: navSpreadVal,
              gasCostUsd: eq.estimatedGasUsd,
              warnings: eq.priceImpact > 1 ? ['High price impact'] : [],
            } as RouteOption;
          })
          .catch((e) => { console.warn('Injective quote failed:', e); return null; })
      );
    }
  } else if (!isSolana) {
    // 1inch
    promises.push(
      get1inchQuote(asset.chainId, asset.buyWithAddress, asset.contractAddress, amountWei, fromDecimals, toDecimals, walletAddress, slippagePct)
        .then(q => mapToRouteOption(q, '1inch Aggregator', navUsd, parseFloat(fromAmount)))
        .catch((e) => { console.warn('1inch failed:', e); return null; })
    );

    // 0x (Supported chains only)
    if ([1, 137, 42161, 8453, 56].includes(asset.chainId)) {
      promises.push(
        get0xQuote(asset.chainId, asset.buyWithAddress, asset.contractAddress, amountWei, fromDecimals, toDecimals, walletAddress, slippagePct)
          .then(q => mapToRouteOption(q, '0x Matchmaker', navUsd, parseFloat(fromAmount)))
          .catch((e) => { console.warn('0x failed:', e); return null; })
      );
    }

    // Odos API
    promises.push(
      getOdosQuote(asset.chainId, asset.buyWithAddress, asset.contractAddress, amountWei, fromDecimals, toDecimals, walletAddress, slippagePct)
        .then(q => mapToRouteOption(q, 'Odos Router', navUsd, parseFloat(fromAmount)))
        .catch((e) => { console.warn('Odos failed:', e); return null; })
    );
  } else {
    // Solana Providers
    promises.push(
      getJupiterQuote(asset.buyWithAddress, asset.contractAddress, amountWei, fromDecimals, toDecimals, slippagePct)
        .then(q => mapToRouteOption(q, 'Jupiter Engine', navUsd, parseFloat(fromAmount)))
        .catch((e) => { console.warn('Jupiter failed:', e); return null; })
    );
  }

  const results = await Promise.all(promises);
  const options = results.filter((r): r is RouteOption => r !== null);

  // Rank by executionScore descending
  options.sort((a, b) => b.executionScore - a.executionScore);

  return options;
}

function inferInputDecimals(symbol: string): number {
  if (symbol === 'USDC' || symbol === 'USDT') return 6;
  return 18;
}

function mapExecutionQuoteToRouteOption(
  quote: ExecutionQuote,
  instrument: RWAInstrument,
  amountWei: string,
  fromDecimals: number,
  navUsd: number | null,
  inputUsd: number,
): RouteOption {
  const outputTokens = parseFloat(quote.toAmountDisplay);
  const effectivePrice = outputTokens > 0 ? inputUsd / outputTokens : Infinity;

  let navSpread = 0;
  if (navUsd && navUsd > 0 && effectivePrice !== Infinity) {
    navSpread = ((effectivePrice - navUsd) / navUsd) * 100;
  }

  const warnings: string[] = [];
  if (quote.priceImpact > 1.0) warnings.push('High price impact');
  if (navSpread > 0.5) warnings.push('Price is significantly above reference');

  const baseOutput = Math.floor(outputTokens * 10);
  const priceImpactPenalty = Math.floor((quote.priceImpact || 0) * 50);
  const gasPenalty = Math.floor(quote.estimatedGasUsd * 2);
  const navDiscountBonus = Math.floor(navSpread * -20);
  const totalScore = 1000 + baseOutput - priceImpactPenalty - gasPenalty + navDiscountBonus;

  return {
    provider: quote.provider,
    fromToken: {
      symbol: instrument.chains[0]?.buyWithSymbol || 'USDC',
      address: instrument.chains[0]?.buyWithAddress || '',
      decimals: fromDecimals,
    },
    toToken: {
      symbol: instrument.symbol,
      address: instrument.chains[0]?.contractAddress || '',
      decimals: instrument.chains[0]?.decimals || 6,
    },
    fromAmount: amountWei,
    toAmount: quote.toAmount,
    toAmountDisplay: quote.toAmountDisplay,
    estimatedGasUsd: quote.estimatedGasUsd,
    priceImpact: quote.priceImpact,
    route: quote.route,
    tx: quote.tx ? { ...quote.tx, gasPrice: '0' } : undefined,
    providerName: quote.provider,
    executionScore: Math.floor(totalScore),
    scoreBreakdown: {
      baseOutput,
      priceImpactPenalty: -priceImpactPenalty,
      gasPenalty: -gasPenalty,
      navDiscountBonus,
    },
    navSpread,
    gasCostUsd: quote.estimatedGasUsd,
    warnings,
  };
}

function getPerpExecutionProvider(instrument: RWAInstrument): ExecutionProvider | null {
  if (instrument.id.startsWith('hl-')) return HyperliquidExecutionProvider;
  if (instrument.id.startsWith('lighter-')) return LighterExecutionProvider;
  if (instrument.id.startsWith('edgex-')) return EdgeXExecutionProvider;
  if (instrument.chains.some(c => c.chainId === 888)) return InjectiveExecutionProvider;
  return null;
}

export async function getBestInstrumentExecution(
  instrument: RWAInstrument,
  fromAmount: string,
  walletAddress: string,
  navUsd: number | null,
  slippagePct = 0.5,
): Promise<RouteOption[]> {
  const chain = instrument.chains[0];
  if (!chain) return [];

  const fromDecimals = inferInputDecimals(chain.buyWithSymbol);
  const amountWei = Math.floor(parseFloat(fromAmount || '0') * 10 ** fromDecimals).toString();
  if (amountWei === '0' || isNaN(Number(amountWei))) return [];

  if (instrument.venueCategory === 'dex_spot') {
    const legacyAsset = instrumentToLegacyAsset(instrument);
    if (!legacyAsset) return [];
    return getBestRWAExecution(
      legacyAsset,
      fromAmount,
      fromDecimals,
      chain.decimals,
      walletAddress,
      navUsd,
      slippagePct,
    );
  }

  if (instrument.venueCategory !== 'onchain_perps') {
    return [];
  }

  const provider = getPerpExecutionProvider(instrument);
  if (!provider) return [];

  const quote = await provider.getQuote({
    instrument,
    chainId: chain.chainId,
    fromAddress: chain.buyWithAddress,
    toAddress: chain.contractAddress,
    amountWei,
    fromDecimals,
    toDecimals: chain.decimals,
    walletAddress,
    slippagePct,
  });

  return [
    mapExecutionQuoteToRouteOption(
      quote,
      instrument,
      amountWei,
      fromDecimals,
      navUsd,
      parseFloat(fromAmount),
    ),
  ];
}

export async function placeInstrumentOrder(params: PlaceOrderRequest): Promise<OrderPlacementResult> {
  if (params.instrument.venueCategory !== 'onchain_perps') {
    return {
      status: 'unsupported',
      venue: params.instrument.issuer,
      error: 'placeInstrumentOrder currently supports onchain_perps only.',
    };
  }

  const provider = getPerpExecutionProvider(params.instrument);
  if (!provider?.placeOrder) {
    return {
      status: 'unsupported',
      venue: params.instrument.issuer,
      error: `No placeOrder implementation for ${params.instrument.id}`,
    };
  }

  return provider.placeOrder(params);
}

function mapToRouteOption(
  quote: SwapQuote,
  providerName: string,
  navUsd: number | null,
  inputUsd: number // Assuming USDC input
): RouteOption {
  const outputTokens = parseFloat(quote.toAmountDisplay);
  const effectivePrice = outputTokens > 0 ? inputUsd / outputTokens : Infinity;
  
  let navSpread = 0;
  if (navUsd && navUsd > 0 && effectivePrice !== Infinity) {
    navSpread = ((effectivePrice - navUsd) / navUsd) * 100;
  }

  const warnings: string[] = [];
  if (quote.priceImpact > 1.0) warnings.push('High price impact');
  if (navSpread > 0.5) warnings.push('Price is significantly above NAV');
  
  // Calculate execution score components
  const baseOutput = Math.floor(outputTokens * 10);
  const priceImpactPenalty = Math.floor((quote.priceImpact || 0) * 50);
  const gasPenalty = Math.floor(quote.estimatedGasUsd * 2);
  const navDiscountBonus = Math.floor(navSpread * -20); // Negative spread (discount) means positive bonus

  const totalScore = 1000 + baseOutput - priceImpactPenalty - gasPenalty + navDiscountBonus;

  return {
    ...quote,
    providerName,
    executionScore: Math.floor(totalScore),
    scoreBreakdown: {
      baseOutput,
      priceImpactPenalty: -priceImpactPenalty,
      gasPenalty: -gasPenalty,
      navDiscountBonus
    },
    navSpread,
    gasCostUsd: quote.estimatedGasUsd,
    warnings
  };
}
