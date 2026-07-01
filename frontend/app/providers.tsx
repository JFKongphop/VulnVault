'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ZamaProvider } from '@zama-fhe/react-sdk';
import { createConfig as createZamaConfig } from '@zama-fhe/react-sdk/wagmi';
import { web } from '@zama-fhe/sdk/web';
import { hardhat as hardhatFhe } from '@zama-fhe/sdk/chains';
import { wagmiConfig } from '@/lib/wagmi';
import { useState } from 'react';

const myHardhat = {
  ...hardhatFhe,
  relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL ?? 'http://localhost:3002',
  network: process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545',
};

const zamaConfig = createZamaConfig({
  chains: [myHardhat],
  wagmiConfig,
  relayers: { [myHardhat.id]: web() },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider config={zamaConfig}>
          {children}
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
