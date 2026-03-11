import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, polygon, polygonAmoy } from 'wagmi/chains'; // polygonAmoy 추가
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
    chains: [mainnet, sepolia, polygon, polygonAmoy], // 체인 목록에 추가
    connectors: [injected()],
    transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
        [polygon.id]: http(),
        [polygonAmoy.id]: http(),
    },
});