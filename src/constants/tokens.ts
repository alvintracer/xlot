export interface Token {
    symbol: string;
    name: string;
    address: string; // Native는 '0xeeee...' 또는 비워둠
    decimals: number;
    logoURI?: string;
    chainId: number; // ✨ 체인 구분용 ID
}

// 체인 ID 상수
export const CHAIN_IDS = {
    ETHEREUM: 1,
    SEPOLIA: 11155111,
    POLYGON: 137,
    BASE: 8453,
};

export const TOKEN_LIST: Token[] = [
    // === Ethereum Mainnet ===
    { symbol: 'ETH', name: 'Ethereum', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, chainId: CHAIN_IDS.ETHEREUM },
    { symbol: 'USDC', name: 'USD Coin', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, chainId: CHAIN_IDS.ETHEREUM },
    { symbol: 'USDT', name: 'Tether USD', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6, chainId: CHAIN_IDS.ETHEREUM },
    { symbol: 'DAI', name: 'Dai Stablecoin', address: '0x6b175474e89094c44da98b954eedeac495271d0f', decimals: 18, chainId: CHAIN_IDS.ETHEREUM },
    { symbol: 'PYUSD', name: 'PayPal USD', address: '0x6c3ea9036406852006290770bedfcaba0e23a0e8', decimals: 6, chainId: CHAIN_IDS.ETHEREUM },
    { symbol: 'XSGD', name: 'StraitsX SGD', address: '0x70e8de73ce538da2beed35d14187f6959a8eca96', decimals: 6, chainId: CHAIN_IDS.ETHEREUM },
    { symbol: 'JPYC', name: 'JPY Coin', address: '0x431d5dff03120afa4bdf332c61a6e1766ef37bdb', decimals: 18, chainId: CHAIN_IDS.ETHEREUM },
    { symbol: 'EURC', name: 'Euro Coin', address: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c', decimals: 6, chainId: CHAIN_IDS.ETHEREUM },

    // === Sepolia Testnet (테스트용) ===
    { symbol: 'ETH', name: 'Sepolia ETH', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, chainId: CHAIN_IDS.SEPOLIA },
    { symbol: 'USDC', name: 'Sepolia USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, chainId: CHAIN_IDS.SEPOLIA }, // 가짜 주소 예시

    // === Polygon (POL) ===
    { symbol: 'POL', name: 'Polygon', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, chainId: CHAIN_IDS.POLYGON },
    { symbol: 'USDC', name: 'USDC (Polygon)', address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6, chainId: CHAIN_IDS.POLYGON },

    // === Base ===
    { symbol: 'ETH', name: 'Base ETH', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', decimals: 18, chainId: CHAIN_IDS.BASE },
    { symbol: 'USDC', name: 'USDC (Base)', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chainId: CHAIN_IDS.BASE },
];

// 지갑의 네트워크(이름)에 따라 Chain ID를 매핑해주는 헬퍼
export const getChainIdByNetwork = (network?: string) => {
    if (!network) return CHAIN_IDS.SEPOLIA; // 기본값
    const net = network.toLowerCase();
    if (net.includes('eth') || net === 'ethereum') return CHAIN_IDS.ETHEREUM;
    if (net.includes('sepolia')) return CHAIN_IDS.SEPOLIA;
    if (net.includes('polygon') || net.includes('pol')) return CHAIN_IDS.POLYGON;
    if (net.includes('base')) return CHAIN_IDS.BASE;
    return CHAIN_IDS.SEPOLIA;
};