import { createConfig, http } from 'wagmi';
import { hardhat, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [hardhat, sepolia],
  connectors: [injected()],
  transports: {
    [hardhat.id]: http(process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545'),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
  },
});
