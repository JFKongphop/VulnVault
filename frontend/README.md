# VulnVault Frontend

Privacy-preserving bug bounty platform built with Next.js 15, React 19, wagmi, and Zama FHE encryption.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Running Hardhat local network with deployed contracts
- Environment variables configured

### Installation

```bash
cd frontend
npm install
```

### Environment Setup

1. Copy the environment template:
```bash
cp .env.local.example .env.local
```

2. Update `.env.local` with your deployed contract addresses:
```env
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337

# Contract Addresses (update after deployment)
NEXT_PUBLIC_BUG_BOUNTY_PROGRAM=0x...
NEXT_PUBLIC_BOUNTY_VAULT=0x...
NEXT_PUBLIC_CONFIDENTIAL_PAYOUTS=0x...
NEXT_PUBLIC_MERKLE_TREE=0x...
NEXT_PUBLIC_VERIFIER=0x...
NEXT_PUBLIC_WHITEHAT_REPUTATION=0x...
NEXT_PUBLIC_DISPUTE_RESOLVER=0x...
NEXT_PUBLIC_PROGRAM_REGISTRY=0x...
NEXT_PUBLIC_MOCK_USDT=0x...
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## 📁 Project Structure

```
frontend/
├── app/                    # Next.js 15 App Router
│   ├── page.tsx           # Home page with programs
│   ├── layout.tsx         # Root layout
│   ├── providers.tsx      # Wagmi + FHE providers
│   └── globals.css        # Global styles
├── components/
│   ├── ui/                # Reusable UI components
│   │   ├── Badge.tsx      # Severity & status badges
│   │   ├── Button.tsx     # Button with variants
│   │   ├── Card.tsx       # Glass card wrapper
│   │   ├── Hash.tsx       # Address display
│   │   ├── Input.tsx      # Form inputs
│   │   └── Loading.tsx    # Loading spinners
│   └── Navbar.tsx         # Navigation bar
├── hooks/                 # Custom React hooks
│   ├── useProgramData.ts  # Read program info
│   ├── useSubmitReport.ts # Submit report with FHE
│   ├── useReputation.ts   # FHE reputation queries
│   └── useWithdraw.ts     # ZK proof withdrawal
├── lib/                   # Utilities
│   ├── contracts.ts       # Contract ABIs & addresses
│   ├── poseidon.ts        # Poseidon hashing
│   └── wagmi.ts           # Wagmi configuration
└── styles/
    └── raxclaw.css        # RAXCLAW design system
```

## 🎨 Design System

VulnVault uses the **RAXCLAW** design system:

- **Typography**: Inter (sans-serif) + JetBrains Mono (monospace)
- **Color Scheme**: Monochrome with accent colors for severity
- **Components**: Glassmorphic cards with backdrop blur
- **Theme**: Security/hacker aesthetic with terminal vibes

See `styles/raxclaw.css` for the complete CSS system.

## 🔐 Key Features

### FHE Encryption (Zama)

Reports are encrypted using Fully Homomorphic Encryption:

```typescript
import { useEncrypt, useDecrypt, useAllow } from '@zama-fhe/react-sdk';

// Grant permission to contract
await allow(contractAddress);

// Encrypt data
const encrypted = await encrypt(value, contractAddress);

// Decrypt data
const decrypted = await decrypt(encryptedHandle);
```

### ZK Proofs (Groth16)

Anonymous withdrawals using zero-knowledge proofs:

```typescript
import { useWithdraw } from '@/hooks/useWithdraw';

const { withdraw } = useWithdraw();

await withdraw({
  secret0,      // Commitment secret
  secret1,      // Commitment secret
  impactType,   // Impact type
  severity,     // Severity level
  recipient,    // Withdrawal address
});
```

### Poseidon Commitments

Privacy-preserving commitments:

```typescript
import { generateCommitment, generateSecrets } from '@/lib/poseidon';

const { secret0, secret1 } = generateSecrets();
const commitment = generateCommitment(secret0, secret1, impactType, severity);
```

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **TypeScript**: 5.7
- **Web3**: wagmi 2.14 + viem 2.21
- **FHE**: @zama-fhe/react-sdk 3.0
- **ZK Proofs**: snarkjs 0.7.5
- **Hashing**: poseidon-lite 0.3.0
- **State**: @tanstack/react-query 5.62

## 📝 Development Notes

### Working with FHE

1. Always call `allow()` before encrypting for a contract
2. Check `useIsAllowed()` to see if permission is granted
3. Encrypted data is stored as `bytes` on-chain
4. Decryption requires the user's private key

### Working with ZK Proofs

1. Generate commitment during report submission
2. Save `secret0` and `secret1` securely (user's responsibility)
3. Generate proof during withdrawal
4. Nullifier prevents double-spending

### Contract Interaction

All contract interactions use wagmi hooks:

```typescript
// Read contract data
const { data } = useReadContract({
  address: CONTRACTS.BUG_BOUNTY_PROGRAM,
  abi: BUG_BOUNTY_PROGRAM_ABI,
  functionName: 'getProgramInfo',
});

// Write to contract
const { writeContract } = useWriteContract();
writeContract({
  address: CONTRACTS.BUG_BOUNTY_PROGRAM,
  abi: BUG_BOUNTY_PROGRAM_ABI,
  functionName: 'submitReport',
  args: [/* ... */],
});
```

## 🔄 Deployment Checklist

- [ ] Deploy all smart contracts to target network
- [ ] Update `.env.local` with contract addresses
- [ ] Update `lib/wagmi.ts` with correct chain config
- [ ] Test FHE encryption on Zama Devnet
- [ ] Generate ZK circuits (bountyClaim.wasm, bountyClaim.zkey)
- [ ] Place circuit files in `public/circuits/`
- [ ] Test all user flows end-to-end
- [ ] Build and deploy to hosting platform

## 📚 Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [wagmi Documentation](https://wagmi.sh)
- [Zama FHE SDK](https://docs.zama.ai/fhevm)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [RAXCLAW Design System](../style.md)
- [Frontend Architecture](../FRONTEND_DESIGN.md)

## 🐛 Troubleshooting

### Wallet Connection Issues

- Ensure MetaMask is connected to Hardhat network (localhost:8545)
- Check chain ID matches (31337 for Hardhat)

### FHE Encryption Errors

- Grant permission using `allow()` before encrypting
- Ensure contract address is correct
- Check Zama SDK is initialized in providers

### Contract Read/Write Errors

- Verify contract addresses in `.env.local`
- Check wallet has sufficient funds for gas
- Ensure contracts are deployed on current network

## 📄 License

MIT
