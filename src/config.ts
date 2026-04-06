import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, polygon, polygonAmoy, base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
    chains: [mainnet, sepolia, polygon, polygonAmoy, base],
    connectors: [injected()],
    transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
        [polygon.id]: http(),
        [polygonAmoy.id]: http(),
        [base.id]: http(),
    },
});