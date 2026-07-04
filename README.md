# VulnVault — Confidential Bug Bounty Protocol & Anonymous Whitehat Reputation

A fully on-chain bug bounty platform where every sensitive report field is encrypted using Fully Homomorphic Encryption (FHE) via [fhEVM](https://github.com/zama-ai/fhevm) by Zama, and payouts are withdrawn anonymously using zero-knowledge proofs (Groth16 / Circom).

---

## Cryptography Stack

VulnVault uses three distinct cryptographic layers, each assigned to a specific part of the system:

| Layer | Algorithm | Where Used |
|---|---|---|
| **Symmetric encryption** | AES-GCM (256-bit) | Report content encrypted client-side before submission — title, description, PoC, protocol name, contract address, attachments |
| **Asymmetric encryption** | RSA-OAEP (2048-bit) | Admin's public key encrypts the AES symmetric key. Only the admin's RSA private key can recover the report content |
| **Fully Homomorphic Encryption** | fhEVM (`euint8`, `euint32`, `euint64`, `ebool`) | On-chain computation over encrypted data — severity auto-escalation, bounty locking, vault balances, reputation scoring, dispute vote tallying |
| **Zero-Knowledge Proofs** | Groth16 (Circom 2 / snarkjs) | Anonymous withdrawal — proves Merkle inclusion without linking submission wallet to recipient wallet |

**How the layers compose:**

```
Report submission:
  Reporter → AES-GCM encrypt report text
          → RSA-OAEP encrypt AES key with admin pubkey   → stored on-chain (bytes)
          → FHE encrypt severity + impactType             → stored on-chain (euint8)
          → poseidon4(secrets, impactType, severity)      → commitment (bytes32)

Admin review:
  Admin → RSA-OAEP decrypt AES key with private key
        → AES-GCM decrypt report text (client-side only)
        → FHE oracle decrypts severity handle             → readable in dashboard

Withdrawal:
  Reporter → snarkjs Groth16 prove(secrets, Merkle path)  → ZK proof (browser)
           → ConfidentialPayouts.withdraw(proof, recipient) → on-chain Groth16 verify
           → vault releases cUSDT to fresh wallet          → no link to submission wallet
```

---

## Problems We Solve

Traditional bug bounty platforms are broken by default. Report contents, reporter identities, and bounty amounts are all visible — creating risks for researchers and sponsors alike.

### 1. Report Content Exposure

On transparent blockchains, every vulnerability detail is public the moment you submit. Malicious actors can exploit the bug before the sponsor patches it. With FHE:
- Protocol name, contract address, title, description, and proof-of-concept are all stored as ciphertexts — never readable on-chain
- Only the program admin (who holds the RSA decryption key) can decrypt them

### 2. Reporter Identity Linkage

Connecting a researcher's submission wallet to their payout address creates a permanent on-chain dossier of their work. With ZK proofs:
- Withdrawal uses a Groth16 proof of Merkle inclusion — zero link between submission wallet and recipient wallet
- The commitment scheme (`poseidon4(secret[2], impactType, severity)`) means only the reporter can claim their bounty

### 3. Bounty Amount Opacity

Plaintext bounty amounts reveal how much sponsors value different bug classes, letting competitors calibrate attacks. With FHE:
- Vault balances and per-report locks are `euint64` ciphertexts — never exposed as plaintext
- Only the program admin can read the encrypted vault state

### 4. Reputation Stalking

Publicly visible reputation scores let adversaries target prolific researchers. With FHE:
- Reputation score and lifetime earnings are stored as `euint32`/`euint64` ciphertexts
- Researchers decrypt their own score client-side via the Zama KMS — nobody else sees it

### 5. Dispute Manipulation

Open voting lets arbiters see each other's votes and collude. With FHE:
- Each arbiter's vote is an `euint8` ciphertext — individual votes are never revealed
- Only the final tally is made publicly decryptable via the oracle

---

## Token Standard — ERC-7984

All bounties are denominated in **cUSDT**, an [ERC-7984](https://eips.ethereum.org/EIPS/eip-7984) confidential token. ERC-7984 is an encrypted-balance token standard (analogous to ERC-20 but for fhEVM) where:

- **Balances are `euint64` ciphertexts** — the chain never sees a plaintext amount.
- **Transfers are encrypted** — `confidentialTransferAndCall` carries encrypted handles, not plaintext values.
- **`IERC7984Receiver`** — contracts that accept confidential deposits implement this interface (used by `BountyVault.sol`).

---

## Contracts (Sepolia)

| Contract | Description | Address |
|---|---|---|
| `MockUSDT.sol` | Underlying ERC-20 test token. | [0xe9327efaB31eA971d868D55ce18e364b064fc32B](https://sepolia.etherscan.io/address/0xe9327efaB31eA971d868D55ce18e364b064fc32B) |
| `MockConfidentialUSDT.sol` | ERC-7984 confidential wrapper — balances and transfers fully encrypted via fhEVM. | [0x525B56B06BC146383E23e5318d64fcfb7CbdD28a](https://sepolia.etherscan.io/address/0x525B56B06BC146383E23e5318d64fcfb7CbdD28a) |
| `BountyVault.sol` | Timelocked encrypted custody. Balances stored as `euint64`. 48h admin withdrawal timelock. | [0x1D82e46d13192E432eB3413f4388a217B225BFC7](https://sepolia.etherscan.io/address/0x1D82e46d13192E432eB3413f4388a217B225BFC7) |
| `BugBountyProgram.sol` | Core FHE report storage. Encrypted fields: protocol, address, title, description, PoC, severity, impact type, bounty amount, admin notes. | [0x39D0c028C087244929162dCBD977a845e8f1FeBc](https://sepolia.etherscan.io/address/0x39D0c028C087244929162dCBD977a845e8f1FeBc) |
| `BugBountyMerkleTree.sol` | On-chain Poseidon Merkle tree (20 levels, ~1M leaves). Stores approved commitment leaves for ZK proofs. | [0x4d58A4C53fD706c6E1c61F7f3B397E975a5699A7](https://sepolia.etherscan.io/address/0x4d58A4C53fD706c6E1c61F7f3B397E975a5699A7) |
| `BountyClaimVerifier.sol` | On-chain Groth16 verifier. Verifies zero-knowledge proofs of Merkle inclusion before releasing bounty. | [0x1aB455BB0B8DF310FF486236c020057E9094B860](https://sepolia.etherscan.io/address/0x1aB455BB0B8DF310FF486236c020057E9094B860) |
| `ConfidentialPayouts.sol` | ZK withdrawal engine. Verifies proof, checks nullifier not spent, triggers vault release to fresh recipient address. | [0xcb1A8265a5C7734466cB3542138d92844FFeF22b](https://sepolia.etherscan.io/address/0xcb1A8265a5C7734466cB3542138d92844FFeF22b) |
| `WhitehatReputation.sol` | FHE reputation system. Score (`euint32`) and lifetime earnings (`euint64`) stored as ciphertexts. | [0xb29A27DE1044BC07fa1B348039eb93069067fCc3](https://sepolia.etherscan.io/address/0xb29A27DE1044BC07fa1B348039eb93069067fCc3) |
| `DisputeResolver.sol` | FHE-encrypted arbiter voting. Encrypted ballots, async tally, dispute outcomes trigger vault state changes. | [0x0D8a486a4431ebCadb63c58b19c645D5a5946cB8](https://sepolia.etherscan.io/address/0x0D8a486a4431ebCadb63c58b19c645D5a5946cB8) |

---

## Encrypted Fields at a Glance

| Field | Contract | Type | Privacy Benefit |
|---|---|---|---|
| Protocol name | `BugBountyProgram` | `bytes` (RSA-encrypted) | Hides target from chain observers |
| Contract address | `BugBountyProgram` | `bytes` (RSA-encrypted) | Prevents premature exploit |
| Vulnerability title | `BugBountyProgram` | `bytes` (RSA-encrypted) | Hides bug class until patch |
| Description | `BugBountyProgram` | `bytes` (RSA-encrypted) | Full report content hidden |
| Proof of concept | `BugBountyProgram` | `bytes` (RSA-encrypted) | Exploit details never public |
| Impact type | `BugBountyProgram` | `euint8` | Hides severity category |
| Severity level | `BugBountyProgram` | `euint8` | Auto-escalation without leaking level |
| Bounty amount | `BugBountyProgram` | `euint64` | Payment amount stays private |
| Admin notes | `BugBountyProgram` | `bytes` (RSA-encrypted) | Internal review stays private |
| Vault available balance | `BountyVault` | `euint64` | Sponsor's total funds hidden |
| Vault locked balance | `BountyVault` | `euint64` | Pending payouts hidden |
| Per-report lock | `BountyVault` | `euint64` | Individual bounty hidden |
| Reputation score | `WhitehatReputation` | `euint32` | Only researcher can see own score |
| Lifetime earnings | `WhitehatReputation` | `euint64` | Researcher's earnings history private |
| Arbiter vote | `DisputeResolver` | `euint8` | Individual votes never revealed |

---

## ZK Circuit — bountyClaim

The withdrawal circuit (`circuit/bountyClaim.circom`) is a Groth16 proof with:

- **Private inputs**: `secret[2]`, `impactType`, `severity`, `pathElements[20]`, `pathIndices[20]`
- **Public inputs**: `root` (Merkle root), `nullifier` (commitment hash)

**Commitment**: `poseidon4(secret[0], secret[1], impactType, severity)`

**What the proof proves**:
1. The prover knows `secret[2]`, `impactType`, `severity` that hash to the commitment
2. The commitment is a leaf in the approved Merkle tree (20-level Poseidon tree)
3. The nullifier equals the commitment (preventing double-spend)

```circom
// bountyClaim.circom — core constraint
component commitmentHash = Poseidon(4);
commitmentHash.inputs[0] <== secret[0];
commitmentHash.inputs[1] <== secret[1];
commitmentHash.inputs[2] <== impactType;
commitmentHash.inputs[3] <== severity;

nullifier === commitmentHash.out;  // nullifier IS the commitment

// Merkle inclusion proof (20 levels)
component merkle = MerkleTreeInclusionProof(20);
merkle.leaf <== commitmentHash.out;
merkle.root === root;
```

---

## FHE Highlights

### Encrypted Report Storage

```solidity
// BugBountyProgram.sol — all sensitive fields are ciphertexts
struct SubmittedReport {
    bytes encryptedProtocol;           // RSA-encrypted with admin's public key
    bytes encryptedContractAddress;    // RSA-encrypted
    euint8 encryptedImpactType;        // FHE — enables auto-escalate without leaking
    euint8 encryptedSeverity;          // FHE — compared homomorphically
    bytes encryptedTitle;              // RSA-encrypted
    bytes encryptedDescription;        // RSA-encrypted
    bytes encryptedPoC;                // RSA-encrypted
    euint64 encryptedBountyAmount;     // FHE — accumulated into reputation earnings
    bytes encryptedAdminNotes;         // RSA-encrypted
}
```

### Auto-Escalation Without Leaking Severity

```solidity
// BugBountyProgram.sol — critical reports auto-flagged without revealing severity
function _checkAutoEscalate(bytes32 submissionId) internal {
    SubmittedReport storage r = _submissions[submissionId];
    ebool isCritical = FHE.eq(r.encryptedSeverity, FHE.asEuint8(3));
    FHE.makePubliclyDecryptable(isCritical);         // oracle decrypts: true/false only
    emit CriticalReportFlagged(submissionId, ebool.unwrap(isCritical));
}
```

The oracle network decrypts `isCritical` and returns a boolean proof. The actual severity level is never revealed.

### Encrypted Vault with Graceful Degradation

```solidity
// BountyVault.sol — FHE.select() clamps instead of reverting
euint64 actual = FHE.select(
    FHE.gte(_state.availableBalance, requested),
    requested,
    _state.availableBalance          // silently reduces to available amount
);
_state.availableBalance = FHE.sub(_state.availableBalance, actual);
_state.lockedBalance = FHE.add(_state.lockedBalance, actual);
```

No plaintext balance checks — the vault can never revert on insufficient funds, only silently clamp.

### Confidential Reputation Accumulation

```solidity
// WhitehatReputation.sol — earnings accumulate as FHE ciphertexts across reports
function _incrementScoreInternal(
    bytes32 commitment, uint8 severity, euint64 bountyAmount
) internal {
    euint32 delta = FHE.asEuint32(_getPoints(severity));
    reputationScores[commitment] = FHE.add(reputationScores[commitment], delta);
    totalEarnings[commitment] = FHE.add(totalEarnings[commitment], bountyAmount);
    // Only the researcher can decrypt — via allowScoreDecrypt() + allowEarningsDecrypt()
}
```

Nobody — not the protocol, not other researchers — can read a researcher's score or earnings without their wallet's decryption key.

### Encrypted Dispute Voting

```solidity
// DisputeResolver.sol — individual arbiter votes are ciphertexts
function submitVote(uint256 disputeId, externalEuint8 encVote, bytes calldata proof)
    external onlyArbiter(disputeId) {
    dispute.encryptedVotes[msg.sender] = FHE.fromExternal(encVote, proof);
    FHE.allowThis(dispute.encryptedVotes[msg.sender]);
}

// resolveDispute() — tally over all encrypted votes
euint64 reporterVotes = FHE.asEuint64(0);
for (uint i = 0; i < voters.length; i++) {
    ebool votedForReporter = FHE.eq(dispute.encryptedVotes[voters[i]], FHE.asEuint8(1));
    reporterVotes = FHE.add(reporterVotes, FHE.select(votedForReporter, one, zero));
}
FHE.makePubliclyDecryptable(reporterWon);  // oracle reveals only the outcome
```

---

## Architecture & Contract Flow

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 15)                         │
│  Zama React SDK — wagmi v2 — viem — snarkjs (Groth16 in browser)     │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ encrypted handles + inputProof / ZK proof
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Sepolia Testnet (fhEVM)                        │
│                                                                      │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐  │
│  │ BugBountyProgram│───►│   BountyVault    │◄───│ConfidentialPay │  │
│  │ (FHE reports)   │    │ (euint64 custody)│    │outs (ZK verify)│  │
│  └────────┬────────┘    └──────────────────┘    └───────┬────────┘  │
│           │                                             │           │
│  ┌────────▼────────┐    ┌──────────────────┐    ┌───────▼────────┐  │
│  │WhitehatReputatn │    │BugBountyMerkle   │    │BountyClaimVeri │  │
│  │(euint32 scores) │    │Tree (Poseidon20) │    │fier (Groth16)  │  │
│  └─────────────────┘    └──────────────────┘    └────────────────┘  │
│  ┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐  │
│  │DisputeResolver  │    │ProgramRegistry   │    │   Zama KMS     │  │
│  │(euint8 votes)   │    │(program factory) │    │  (off-chain)   │  │
│  └─────────────────┘    └──────────────────┘    └────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

### Flow 1 — Submit Report (Researcher)

```
Researcher
 │
 ├─1─► Derive commitment (browser):
 │         commitment = poseidon4(secret[0] % FIELD, secret[1] % FIELD,
 │                                impactType, severity)
 │
 ├─2─► Encrypt severity + impactType via Zama React SDK:
 │         useEncrypt([{ value: impactType, type: 'euint8' },
 │                     { value: severity,  type: 'euint8' }])
 │         → { handles[0..1], inputProof }
 │
 ├─3─► Encrypt report content client-side with admin's RSA public key:
 │         BugReportEncryption.encryptReport({ protocol, contractAddress,
 │             title, description, poc, gistLink, attachments })
 │         → { encryptedProtocol, encryptedTitle, ... }
 │
 └─4─► BugBountyProgram.submitReport(
             commitment,
             encryptedProtocol, encryptedContractAddress,
             handles[0], handles[1], inputProof,      ← FHE impact + severity
             encryptedTitle, encryptedDescription,
             encryptedPoC, encryptedGistLink,
             encryptedSymmetricKey                    ← for self-decryption
         )
         FHE.fromExternal verifies impactType/severity proof
         _checkAutoEscalate: FHE.eq(severity, 3) → ebool → oracle decrypts
```

---

### Flow 2 — Review & Approve (Admin)

```
Admin
 │
 ├─1─► BugBountyProgram.reviewReport(submissionId)
 │         FHE.makePubliclyDecryptable(impactType, severity)
 │         Zama KMS decrypts → admin sees plaintext impact/severity
 │
 ├─2─► Admin decrypts report content with RSA private key (browser)
 │         DecryptReportModal: RSA-OAEP decrypt of all bytes fields
 │
 ├─3─► FHE encrypt bounty amount:
 │         useEncrypt([{ value: amount, type: 'euint64' }])
 │         → { handle, inputProof }
 │
 └─4─► BugBountyProgram.approveReport(
             submissionId,
             encBountyAmount, severity, inputProof,
             encryptedNotes, plainBountyAmount       ← stored for reporter UX
         )
         → vault.lockFunds(programId, commitment, encBountyAmount)
         → merkleTree.insertApprovedLeaf(commitment)
         → reputation.incrementScore(commitment, severity, encBountyAmount)
```

---

### Flow 3 — Anonymous Withdrawal (Researcher, fresh wallet)

```
Researcher (using a NEW wallet with no prior history)
 │
 ├─1─► Fetch Merkle tree state:
 │         currentRoot = merkleTree.getRoot()
 │         siblings = merkleTree.getMerklePath(leafIndex)
 │
 ├─2─► Generate Groth16 proof in browser (snarkjs):
 │         witness = { root, nullifier=commitment,
 │                     secret[2], impactType, severity,
 │                     pathElements[20], pathIndices[20] }
 │         proof = groth16.fullProve(witness, .wasm, .zkey)
 │
 ├─3─► Fetch bounty amount (auto — no manual input):
 │         approvedBountyAmount(submissionId) → uint256
 │
 └─4─► ConfidentialPayouts.withdraw(
             root, nullifier, recipient,
             amount (in micro-USDT),
             groth16Proof
         )
         → BountyClaimVerifier.verifyProof(...)         ← on-chain Groth16
         → nullifierSpent[nullifier] = true             ← prevent double-spend
         → vault.releaseBounty(commitment, encAmount, recipient)
         → cUSDT.confidentialTransfer(recipient, encAmount)

  Chain sees: nullifierHash, root, recipient address — NO link to submission wallet ✓
```

---

### Flow 4 — Reputation Check (Researcher)

```
Researcher
 │
 ├─1─► Derive commitment from secrets (same as submission)
 │
 ├─2─► WhitehatReputation.allowScoreDecrypt(commitment)
 │     WhitehatReputation.allowEarningsDecrypt(commitment)
 │         FHE.allow(score, msg.sender)      ← grants KMS decrypt permission
 │         FHE.allow(earnings, msg.sender)
 │
 └─3─► useUserDecrypt (Zama React SDK):
         handles: [scoreHandle, earningsHandle]
         → KMS decrypts client-side
         → bigint score, bigint earnings displayed

 Tiers: Unranked (0) → Bronze (≥50) → Silver (≥150) → Gold (≥400) → Elite (≥1000)
```

---

### Key Design Principle — ACL Permissions

Every FHE ciphertext must be explicitly granted to each address that needs to operate on it:

```solidity
FHE.allowThis(encBountyAmount);               // BugBountyProgram can store it
FHE.allow(encBountyAmount, address(vault));    // BountyVault can lock it
FHE.allow(encBountyAmount, r.reporter);        // Reporter can decrypt their own
FHE.allow(encBountyAmount, reputation);        // Reputation can accumulate earnings
```

Without `FHE.allow`, even the user cannot decrypt their own values.

---

## Reputation Tiers

| Tier | Points Required | Points per Severity |
|---|---|---|
| Unranked | 0 | — |
| Bronze | ≥ 50 | Low: 10 |
| Silver | ≥ 150 | Medium: 25 |
| Gold | ≥ 400 | High: 50 |
| Elite | ≥ 1000 | Critical: 100 |

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
# Install root dependencies (contracts + hardhat)
npm install

# Install frontend dependencies
cd frontend && npm install
```

### Environment Setup

```bash
# Root — for Sepolia deployment
cp .env.example .env
# Edit: PRIVATE_KEY, INFURA_API_KEY

# Frontend
cp frontend/.env.local.example frontend/.env.local
# Edit: NEXT_PUBLIC_* contract addresses
```

### Compile & Test

```bash
# Compile contracts
npx hardhat compile

# Run all tests (160 tests, local FHEVM mock)
npx hardhat test

# Run a specific test file
npx hardhat test test/BountyVault.test.ts
```

### Deploy to Sepolia

```bash
# Full deployment (all contracts + wiring)
npx hardhat run scripts/deployFull.ts --network sepolia

# Update frontend/.env.local with the printed addresses
```

### Run Frontend

```bash
cd frontend
npm run dev        # development
npm run build      # production build check
```

---

## Project Structure

```
vulnvault/
├── contracts/
│   ├── BugBountyProgram.sol        # FHE-encrypted report storage + review lifecycle
│   ├── BountyVault.sol             # ERC-7984 encrypted custody (euint64 balances)
│   ├── ConfidentialPayouts.sol     # ZK withdrawal engine (Groth16 verifier)
│   ├── WhitehatReputation.sol      # FHE reputation scoring (euint32/euint64)
│   ├── DisputeResolver.sol         # FHE encrypted arbiter voting
│   ├── BugBountyMerkleTree.sol     # On-chain Poseidon Merkle tree (20 levels)
│   ├── MerkleTree.sol              # Tornado Cash-style Poseidon tree base
│   ├── ProgramRegistry.sol         # Program factory + multi-program registry
│   └── interfaces/                 # IBugBountyProgram, IBountyVault, etc.
├── circuit/
│   └── bountyClaim.circom          # Groth16 circuit: Merkle inclusion + nullifier
├── test/
│   ├── BugBountyProgram.test.ts
│   ├── BountyVault.test.ts
│   ├── ConfidentialPayouts.test.ts
│   ├── WhitehatReputation.test.ts
│   ├── DisputeResolver.test.ts
│   ├── BountyClaimVerifier.test.ts
│   ├── BugBountyMerkleTree.test.ts
│   └── integration/
│       └── FullFlow.test.ts        # End-to-end: submit → review → approve → withdraw
├── scripts/
│   ├── deployFull.ts               # Full deployment script
│   └── deploySimple.ts
├── frontend/                       # Next.js 15 UI
│   ├── app/
│   │   ├── page.tsx                # Programs listing
│   │   ├── program/[id]/submit/    # Report submission
│   │   ├── my-reports/             # Researcher's submissions
│   │   ├── withdraw/[submissionId]/ # ZK anonymous withdrawal
│   │   ├── reputation/             # FHE score viewer
│   │   ├── admin/                  # Admin review + vault management
│   │   └── wrap/                   # cUSDT wrap/faucet
│   ├── hooks/
│   │   ├── useWithdraw.ts          # ZK proof generation + withdrawal
│   │   ├── useReputation.ts        # FHE score decryption via Zama SDK
│   │   ├── useReviewReport.ts      # Admin approve/reject
│   │   └── useAdminDecrypt.ts      # RSA report decryption
│   └── lib/
│       └── contracts.ts            # ABI + contract addresses
├── hardhat.config.ts
└── package.json
```

## Available Scripts

| Script | Description |
|---|---|
| `npx hardhat compile` | Compile all contracts |
| `npx hardhat test` | Run all 160 tests (local FHEVM mock) |
| `npx hardhat run scripts/deployFull.ts --network sepolia` | Deploy to Sepolia |
| `cd frontend && npm run dev` | Start frontend dev server |
| `cd frontend && npm run build` | Production build |

---

## Further Reading

- [fhEVM Documentation](https://docs.zama.ai/fhevm)
- [fhEVM Hardhat Plugin](https://docs.zama.ai/protocol/solidity-guides/development-guide/hardhat)
- [ERC-7984 Standard](https://eips.ethereum.org/EIPS/eip-7984)
- [Groth16 / snarkjs](https://github.com/iden3/snarkjs)
- [Circom Documentation](https://docs.circom.io)

---

## License

MIT

---

**Built with [Zama fhEVM](https://github.com/zama-ai/fhevm)**

