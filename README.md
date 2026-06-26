# VulnVault — Confidential Bug Bounty Platform

**FHE + ZK privacy-preserving bug bounty infrastructure.**

Built for the Zama Developer Program Mainnet Season 3 — Builder Track — Composable Privacy.

## Overview

Bug bounty platforms like Immunefi operate on public blockchains, leaking sensitive data:
- Report contents are visible before patches deploy
- Contract addresses reveal exploit targets
- Payment amounts expose vulnerability criticality
- Reporter identity is linkable from submission to payout

VulnVault solves this with **FHE** (Fully Homomorphic Encryption) and **ZK** (Zero Knowledge Proofs):

| Layer | Technology | What It Hides |
|-------|-----------|---------------|
| FHE | Zama fhEVM | Report contents, severity, bounty amounts |
| ZK | Tornado Cash pattern | Reporter identity → payout wallet link |

## Architecture

```
ProgramRegistry (public directory + factory)
  ├── BugBountyProgram (FHE-encrypted submissions)
  ├── BountyVault (timelocked fund custody)
  ├── ConfidentialPayouts (ZK withdrawal engine)
  ├── WhitehatReputation (FHE-encrypted scores)
  ├── DisputeResolver (FHE-encrypted voting)
  └── MerkleTree (ZK commitment tree — interface only)
```

## Contracts

| Contract | Lines | Tech |
|----------|-------|------|
| `BugBountyProgram.sol` | ~300 | FHE deep |
| `MerkleTree.sol` | Interface | ZK (developer) |
| `ConfidentialPayouts.sol` | ~150 | ZK skeleton |
| `WhitehatReputation.sol` | ~200 | FHE |
| `ProgramRegistry.sol` | ~250 | Plain + FHE gate |
| `DisputeResolver.sol` | ~280 | FHE voting |
| `BountyVault.sol` | ~200 | Plain + timelock |

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run all tests
npm test

# Run a specific test
npx hardhat test test/BountyVault.test.ts

# Deploy (localhost)
npm run deploy:localhost
```

## Test Coverage

Each contract has comprehensive tests:

- **BountyVault.test.ts** — Deposit, lock/release, timelocked withdrawal, access control, edge cases
- **WhitehatReputation.test.ts** — Score increment, threshold gate, tier unlocks, FHE decryption
- **BugBountyProgram.test.ts** — Submit/review/approve/reject, access control, freeze/unfreeze
- **DisputeResolver.test.ts** — Full dispute flow, FHE voting, tally, access control
- **ConfidentialPayouts.test.ts** — ZK withdrawal (placeholder), nullifier double-spend protection
- **ProgramRegistry.test.ts** — Factory deployment, program management, reputation gating
- **integration/FullFlow.test.ts** — End-to-end: createProgram → submitReport → reviewReport → approveReport → withdraw → dispute flow

## Full Flow

```
1. Protocol calls ProgramRegistry.createProgram()
   → Deploys BugBountyProgram + BountyVault + ConfidentialPayouts

2. Reporter generates commitment = keccak256(secret, nullifier)
   → Keeps secret + nullifier offline (claim ticket)

3. Reporter calls BugBountyProgram.submitReport()
   → All sensitive fields encrypted via FHE
   → Commitment inserted into Merkle tree

4. Admin calls BugBountyProgram.reviewReport()
   → FHE decrypts fields for admin dashboard
   → Status → UnderReview

5. Admin approves:
   → BountyVault.lockFunds() — funds locked, admin can't rug
   → MerkleTree.insertApprovedLeaf() — reporter can now withdraw
   → WhitehatReputation.incrementScore() — FHE score update

6. Reporter generates ZK proof locally
   → Calls ConfidentialPayouts.withdraw()
   → Bounty paid to fresh wallet — no link to submission wallet

7. Dispute: Reporter escalates rejected report
   → 3 arbiters vote via FHE-encrypted ballots
   → Individual votes never revealed — only final tally
   → Outcome enforced automatically on-chain
```

## Prerequisites

- Node.js >= 20
- npm >= 7
- Hardhat (included as devDependency)

## License

MIT
