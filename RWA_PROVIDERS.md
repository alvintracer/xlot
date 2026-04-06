# RWA Aggregator — Environment Variables

## Required API Keys

| Variable | Provider | Status | Notes |
|----------|----------|--------|-------|
| `VITE_1INCH_API_KEY` | 1inch | **LIVE** | EVM DEX routing. Required for best execution on Ethereum, Polygon, Base, etc. |
| `VITE_ZEROEX_API_KEY` | 0x Protocol | **LIVE** | EVM DEX routing. Supports Ethereum, Polygon, Arbitrum, Base, BSC. |
| `VITE_COINGECKO_API_KEY` | CoinGecko | **LIVE** | Price, NAV, and OHLCV data for all tracked instruments. |

## Optional / Recommended

| Variable | Provider | Status | Notes |
|----------|----------|--------|-------|
| `VITE_OPENOCEAN_API_KEY` | OpenOcean | Scaffold | Multi-chain DEX aggregator. No key required for low traffic. |
| `VITE_BIRDEYE_API_KEY` | Birdeye | Scaffold | Solana token analytics and price data. |

## Provider Scaffolds (No API Required Yet)

| Variable | Provider | Status | Notes |
|----------|----------|--------|-------|
| `VITE_INJECTIVE_API_BASE` | Injective | Scaffold | Synthetic market data. Currently uses static market definitions. |
| `VITE_INJECTIVE_INDEXER_BASE` | Injective Indexer | Scaffold | Real-time market/orderbook data. |
| `VITE_XSTOCKS_API_BASE` | xStocks | Scaffold | Tokenized equity provider. Awaiting official API. |
| `VITE_KRAKEN_TOKENIZED_API_BASE` | Kraken | Scaffold | Tokenized equity/commodity provider. |
| `VITE_ONDO_GM_API_BASE` | Ondo Global Markets | Scaffold | Future Ondo GM product integration. |
| `VITE_ROBINHOOD_EQUITY_API_BASE` | Robinhood | Scaffold | ⚠️ No official public API. Do NOT use undocumented endpoints. |
| `VITE_ROBINHOOD_EQUITY_API_KEY` | Robinhood | Scaffold | ⚠️ Reserved for future official integration only. |

## Public APIs (No Key Required)

- **Jupiter** (Solana DEX): `https://quote-api.jup.ag/v6/quote` — No API key needed.
- **Odos** (EVM DEX): `https://api.odos.xyz/sor/quote/v2` — No API key needed for basic traffic.

## Provider Integration Status

### Execution Providers
- ✅ **1inch** — Live, EVM chains
- ✅ **0x** — Live, major EVM chains (ETH, Polygon, Arbitrum, Base, BSC)
- ✅ **Odos** — Live, EVM chains (public endpoint)
- ✅ **Jupiter** — Live, Solana
- 🔲 **OpenOcean** — Scaffold, multi-chain

### Metadata Providers
- ✅ **CoinGecko** — Live, price/NAV/history
- 🔲 **Birdeye** — Scaffold, Solana analytics

### Market Discovery Providers
- 🔲 **Injective** — Scaffold, synthetic equity/commodity markets
- 🔲 **xStocks** — Scaffold, tokenized equity
- 🔲 **Robinhood** — Scaffold only (no official API)
- 🔲 **Ondo Global Markets** — Scaffold, future product line
