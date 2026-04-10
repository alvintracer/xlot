export interface TokenPrice {
    krw: number;
    usd: number;
    change: number;
}

export interface PriceData {
    tokens: {
        eth: TokenPrice;
        pol: TokenPrice; // ✨ matic -> pol로 변경
        usdt: TokenPrice;
        usdc: TokenPrice;
        btc: TokenPrice;
        sol: TokenPrice;
        trx: TokenPrice;
        inj: TokenPrice;
        dai: TokenPrice;
        pyusd: TokenPrice;
        xsgd: TokenPrice;
        jpyc: TokenPrice;
        eurc: TokenPrice;
    };
    exchangeRate: number;
}

let priceCache: PriceData | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 1000;

const DEFAULT_PRICES: PriceData = {
    tokens: {
        eth: { krw: 3800000, usd: 2600, change: 0 },
        pol: { krw: 1000, usd: 0.70, change: 0 }, // ✨ 기본값 수정
        usdt: { krw: 1450, usd: 1.0, change: 0 },
        usdc: { krw: 1450, usd: 1.0, change: 0 },
        btc: { krw: 135000000, usd: 95000, change: 0 },
        sol: { krw: 200000, usd: 140, change: 0 },
        trx: { krw: 200, usd: 0.15, change: 0 },
        inj: { krw: 30000, usd: 20, change: 0 },
        dai: { krw: 1450, usd: 1.0, change: 0 },
        pyusd: { krw: 1450, usd: 1.0, change: 0 },
        xsgd: { krw: 1085, usd: 0.74, change: 0 },
        jpyc: { krw: 9.6, usd: 0.0066, change: 0 },
        eurc: { krw: 1560, usd: 1.08, change: 0 },
    },
    exchangeRate: 1450,
};

export async function fetchCryptoPrices(): Promise<PriceData> {
    const now = Date.now();
    if (priceCache && (now - lastFetchTime < CACHE_DURATION)) return priceCache;

    try {
        // ✨ matic-network -> polygon-ecosystem-token (POL)으로 변경 권장되나
        // 아직 API 호환성을 위해 둘 다 체크하거나 matic을 pol로 매핑
        const cgHeaders: Record<string, string> = { 'Accept': 'application/json' };
        const cgKeyStr = import.meta.env.VITE_COINGECKO_API_KEY || '';
        if (cgKeyStr) {
            const cgKeys = cgKeyStr.split(',').map((k: string) => k.trim()).filter(Boolean);
            if (cgKeys.length > 0) {
                cgHeaders['x-cg-demo-api-key'] = cgKeys[Math.floor(Math.random() * cgKeys.length)];
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

        const response = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,matic-network,tether,usd-coin,bitcoin,solana,tron,injective-protocol,dai,paypal-usd,xsgd,jpy-coin,euro-coin&vs_currencies=krw,usd&include_24hr_change=true",
            { method: 'GET', headers: cgHeaders, signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) return priceCache || DEFAULT_PRICES;

        const data = await response.json();

        const getPrice = (id: string, fallbackKey: keyof typeof DEFAULT_PRICES.tokens): TokenPrice => {
            const fallback = DEFAULT_PRICES.tokens[fallbackKey];
            return {
                krw: data[id]?.krw || fallback.krw,
                usd: data[id]?.usd || fallback.usd,
                change: data[id]?.usd_24h_change || fallback.change || 0,
            };
        };

        const result: PriceData = {
            tokens: {
                eth: getPrice('ethereum', 'eth'),
                pol: getPrice('matic-network', 'pol'), // ✨ 코인게코는 아직 matic ID를 주로 씀
                usdt: getPrice('tether', 'usdt'),
                usdc: getPrice('usd-coin', 'usdc'),
                btc: getPrice('bitcoin', 'btc'),
                sol: getPrice('solana', 'sol'),
                trx: getPrice('tron', 'trx'),
                inj: getPrice('injective-protocol', 'inj'),
                dai: getPrice('dai', 'dai'),
                pyusd: getPrice('paypal-usd', 'pyusd'),
                xsgd: getPrice('xsgd', 'xsgd'),
                jpyc: getPrice('jpy-coin', 'jpyc'),
                eurc: getPrice('euro-coin', 'eurc'),
            },
            exchangeRate: getPrice('ethereum', 'eth').usd > 0 
                ? (getPrice('ethereum', 'eth').krw / getPrice('ethereum', 'eth').usd) 
                : 1450,
        };

        priceCache = result;
        lastFetchTime = now;
        return result;

    } catch (error) {
        return priceCache || DEFAULT_PRICES;
    }
}