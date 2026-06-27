import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  generateRSAKeyPair,
  BugReportEncryption,
  AdminDecryption,
  RSAKeyPair,
} from "./helpers/encryption";

describe("BugBountyProgram", function () {
  let signers: any, bb: any, bbAddr: string, merkleTree: any;

  before(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    bb = await (
      await ethers.getContractFactory("BugBountyProgram")
    ).deploy(signers[1].address, 0);
    await bb.waitForDeployment();
    bbAddr = await bb.getAddress();
    const hasher = await (await ethers.getContractFactory("Hasher")).deploy();
    await hasher.waitForDeployment();
    merkleTree = await (
      await ethers.getContractFactory("BugBountyMerkleTree", {
        libraries: { Hasher: await hasher.getAddress() },
      })
    ).deploy();
    await merkleTree.waitForDeployment();
    await merkleTree.authorise(bbAddr);
    await bb.connect(signers[1]).setMerkleTree(await merkleTree.getAddress());
  });

  const commitment =
    "0xaaaabbbbccccddddeeeeffff0000111122223333444455556666777788889999";

  // ── Production Encryption Helper with Real AES-GCM + RSA-OAEP
  async function submitWithRealEncryption(
    adminKeys: RSAKeyPair,
    reportData: {
      protocol: string;
      contractAddress: string;
      title: string;
      description: string;
      poc: string;
      gistLink: string;
      attachments: string;
    },
    impactType: number,
    severity: number,
  ): Promise<string> {
    const encryption = new BugReportEncryption();
    const encryptedReport = encryption.encryptReport(reportData);
    const encryptedSymmetricKey = encryption.encryptKeyForAdmin(
      adminKeys.publicKey,
    );

    const input = fhevm.createEncryptedInput(bbAddr, signers[2].address);
    input.add8(impactType);
    input.add8(severity);
    const { handles, inputProof } = await input.encrypt();

    const tx = await bb
      .connect(signers[2])
      .submitReport(
        ethers.randomBytes(32),
        encryptedReport.encryptedProtocol,
        encryptedReport.encryptedContractAddress,
        handles[0],
        handles[1],
        inputProof,
        encryptedReport.encryptedTitle,
        encryptedReport.encryptedDescription,
        encryptedReport.encryptedPoC,
        encryptedReport.encryptedGistLink,
        encryptedReport.encryptedAttachments,
        encryptedSymmetricKey,
      );

    const receipt = await tx.wait();
    const event = receipt?.logs.find(
      (l: any) => l.fragment?.name === "ReportSubmitted",
    );
    return (event as any).args[0];
  }

  // ── Production Encryption Tests (Real AES-GCM + RSA-OAEP + FHE)
  // ─────────────────────────────────────────────────────────

  describe("Production Encryption Flow", () => {
    let adminKeys: RSAKeyPair;

    beforeEach(async () => {
      // Generate admin's RSA key pair (in production: done once, private key in HSM)
      adminKeys = generateRSAKeyPair();

      // Admin sets public key on contract
      await bb.connect(signers[1]).setAdminPublicKey(adminKeys.publicKey);
    });

    it("full encryption/decryption flow: reporter encrypts → admin decrypts", async () => {
      // ──────────────────────────────────────────────────────
      // REPORTER SIDE: Encrypt report data
      // ──────────────────────────────────────────────────────
      const reportData = {
        protocol: "Uniswap V3",
        contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
        title: "Critical Reentrancy Vulnerability in SwapRouter",
        description:
          "A reentrancy vulnerability allows attackers to drain liquidity pools by calling the swap function recursively before state updates are finalized.",
        poc: "// Proof of Concept\ncontract Exploit {\n  function attack() external {\n    router.swap{value: 1 ether}();\n  }\n  receive() external payable {\n    if (address(router).balance > 0) {\n      router.swap();\n    }\n  }\n}",
        gistLink: "https://gist.github.com/whitehat/abc123def456",
        attachments: "ipfs://QmX9k2...proof-screenshots",
      };

      const encryption = new BugReportEncryption();
      const encryptedReport = encryption.encryptReport(reportData);
      const encryptedSymmetricKey = encryption.encryptKeyForAdmin(
        adminKeys.publicKey,
      );

      // FHE encrypt numeric fields
      const input = fhevm.createEncryptedInput(bbAddr, signers[2].address);
      input.add8(1); // impactType: SmartContract
      input.add8(3); // severity: Critical
      const { handles, inputProof } = await input.encrypt();

      // Submit to contract
      const tx = await bb.connect(signers[2]).submitReport(
        ethers.randomBytes(32), // commitment
        encryptedReport.encryptedProtocol,
        encryptedReport.encryptedContractAddress,
        handles[0],
        handles[1],
        inputProof,
        encryptedReport.encryptedTitle,
        encryptedReport.encryptedDescription,
        encryptedReport.encryptedPoC,
        encryptedReport.encryptedGistLink,
        encryptedReport.encryptedAttachments,
        encryptedSymmetricKey,
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (l: any) => l.fragment?.name === "ReportSubmitted",
      );
      const submissionId = (event as any).args[0];

      // ──────────────────────────────────────────────────────
      // ADMIN SIDE: Decrypt report data
      // ──────────────────────────────────────────────────────
      const adminDecryption = new AdminDecryption(adminKeys.privateKey);

      // 1. Retrieve encrypted symmetric key from contract
      const retrievedEncryptedKey = await bb
        .connect(signers[1])
        .getEncryptedSymmetricKey(submissionId);

      // 2. Decrypt symmetric key with admin's private key
      const decryptedSymmetricKey = adminDecryption.decryptSymmetricKey(
        Buffer.from(retrievedEncryptedKey.slice(2), "hex"),
      );

      // 3. Decrypt all report fields with symmetric key
      const decryptedReport = adminDecryption.decryptReport(
        decryptedSymmetricKey,
        {
          encryptedProtocol: Buffer.from(encryptedReport.encryptedProtocol),
          encryptedContractAddress: Buffer.from(
            encryptedReport.encryptedContractAddress,
          ),
          encryptedTitle: Buffer.from(encryptedReport.encryptedTitle),
          encryptedDescription: Buffer.from(
            encryptedReport.encryptedDescription,
          ),
          encryptedPoC: Buffer.from(encryptedReport.encryptedPoC),
          encryptedGistLink: Buffer.from(encryptedReport.encryptedGistLink),
          encryptedAttachments: Buffer.from(
            encryptedReport.encryptedAttachments,
          ),
        },
      );

      // ──────────────────────────────────────────────────────
      // VERIFY: Decrypted data matches original
      // ──────────────────────────────────────────────────────
      expect(decryptedReport.protocol).to.equal(reportData.protocol);
      expect(decryptedReport.contractAddress).to.equal(
        reportData.contractAddress,
      );
      expect(decryptedReport.title).to.equal(reportData.title);
      expect(decryptedReport.description).to.equal(reportData.description);
      expect(decryptedReport.poc).to.equal(reportData.poc);
      expect(decryptedReport.gistLink).to.equal(reportData.gistLink);
      expect(decryptedReport.attachments).to.equal(reportData.attachments);
    });

    it("reporter can decrypt own report using backed-up symmetric key", async () => {
      const reportData = {
        protocol: "Aave V3",
        contractAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
        title: "Flash Loan Attack Vector",
        description: "Flash loans can be used to manipulate oracle prices",
        poc: "exploit code here",
        gistLink: "",
        attachments: "",
      };

      const encryption = new BugReportEncryption();
      const encryptedReport = encryption.encryptReport(reportData);
      const encryptedSymmetricKey = encryption.encryptKeyForAdmin(
        adminKeys.publicKey,
      );

      // Reporter backs up their symmetric key locally
      const reporterBackupKey = encryption.getSymmetricKey();

      // FHE encrypt and submit
      const input = fhevm.createEncryptedInput(bbAddr, signers[2].address);
      input.add8(2);
      input.add8(2);
      const { handles, inputProof } = await input.encrypt();

      await bb
        .connect(signers[2])
        .submitReport(
          ethers.randomBytes(32),
          encryptedReport.encryptedProtocol,
          encryptedReport.encryptedContractAddress,
          handles[0],
          handles[1],
          inputProof,
          encryptedReport.encryptedTitle,
          encryptedReport.encryptedDescription,
          encryptedReport.encryptedPoC,
          encryptedReport.encryptedGistLink,
          encryptedReport.encryptedAttachments,
          encryptedSymmetricKey,
        );

      // ──────────────────────────────────────────────────────
      // REPORTER decrypts using their backed-up key
      // ──────────────────────────────────────────────────────
      const reporterDecryption = new AdminDecryption(Buffer.alloc(0)); // No admin key needed
      const decrypted = reporterDecryption.decryptReport(reporterBackupKey, {
        encryptedProtocol: Buffer.from(encryptedReport.encryptedProtocol),
        encryptedContractAddress: Buffer.from(
          encryptedReport.encryptedContractAddress,
        ),
        encryptedTitle: Buffer.from(encryptedReport.encryptedTitle),
        encryptedDescription: Buffer.from(encryptedReport.encryptedDescription),
        encryptedPoC: Buffer.from(encryptedReport.encryptedPoC),
        encryptedGistLink: Buffer.from(encryptedReport.encryptedGistLink),
        encryptedAttachments: Buffer.from(encryptedReport.encryptedAttachments),
      });

      expect(decrypted.protocol).to.equal(reportData.protocol);
      expect(decrypted.title).to.equal(reportData.title);
      expect(decrypted.description).to.equal(reportData.description);
    });

    it("cannot decrypt with wrong private key", async () => {
      const reportData = {
        protocol: "Test",
        contractAddress: "0x123",
        title: "Title",
        description: "Desc",
        poc: "PoC",
        gistLink: "",
        attachments: "",
      };

      const encryption = new BugReportEncryption();
      const encryptedReport = encryption.encryptReport(reportData);
      const encryptedSymmetricKey = encryption.encryptKeyForAdmin(
        adminKeys.publicKey,
      );

      // Different admin with different keys
      const wrongAdminKeys = generateRSAKeyPair();
      const wrongAdminDecryption = new AdminDecryption(
        wrongAdminKeys.privateKey,
      );

      // Try to decrypt with wrong private key → should throw
      expect(() => {
        wrongAdminDecryption.decryptSymmetricKey(
          Buffer.from(encryptedSymmetricKey),
        );
      }).to.throw();
    });

    it("data remains confidential on-chain (cannot be read without decryption)", async () => {
      const secretData = {
        protocol: "TopSecretProtocol",
        contractAddress: "0xSecretContract",
        title: "Zero-Day Exploit",
        description: "This is extremely sensitive information",
        poc: "Secret exploit code",
        gistLink: "",
        attachments: "",
      };

      const encryption = new BugReportEncryption();
      const encryptedReport = encryption.encryptReport(secretData);
      const encryptedSymmetricKey = encryption.encryptKeyForAdmin(
        adminKeys.publicKey,
      );

      const input = fhevm.createEncryptedInput(bbAddr, signers[2].address);
      input.add8(1);
      input.add8(3);
      const { handles, inputProof } = await input.encrypt();

      const tx = await bb
        .connect(signers[2])
        .submitReport(
          ethers.randomBytes(32),
          encryptedReport.encryptedProtocol,
          encryptedReport.encryptedContractAddress,
          handles[0],
          handles[1],
          inputProof,
          encryptedReport.encryptedTitle,
          encryptedReport.encryptedDescription,
          encryptedReport.encryptedPoC,
          encryptedReport.encryptedGistLink,
          encryptedReport.encryptedAttachments,
          encryptedSymmetricKey,
        );

      // Verify encrypted data does NOT contain plaintext
      const encryptedTitleHex = ethers.hexlify(encryptedReport.encryptedTitle);
      const encryptedDescHex = ethers.hexlify(
        encryptedReport.encryptedDescription,
      );

      // Plaintext should NOT appear in ciphertext
      expect(
        encryptedTitleHex.includes(Buffer.from("Zero-Day").toString("hex")),
      ).to.be.false;
      expect(
        encryptedDescHex.includes(Buffer.from("sensitive").toString("hex")),
      ).to.be.false;
    });

    it("multiple reports with different symmetric keys are independent", async () => {
      const report1 = {
        protocol: "Protocol1",
        contractAddress: "0x111",
        title: "Bug1",
        description: "Desc1",
        poc: "PoC1",
        gistLink: "",
        attachments: "",
      };

      const report2 = {
        protocol: "Protocol2",
        contractAddress: "0x222",
        title: "Bug2",
        description: "Desc2",
        poc: "PoC2",
        gistLink: "",
        attachments: "",
      };

      // Each report gets its own symmetric key
      const encryption1 = new BugReportEncryption();
      const encryption2 = new BugReportEncryption();

      const encrypted1 = encryption1.encryptReport(report1);
      const encrypted2 = encryption2.encryptReport(report2);

      const key1ForAdmin = encryption1.encryptKeyForAdmin(adminKeys.publicKey);
      const key2ForAdmin = encryption2.encryptKeyForAdmin(adminKeys.publicKey);

      // Keys should be different
      expect(Buffer.from(key1ForAdmin).toString("hex")).to.not.equal(
        Buffer.from(key2ForAdmin).toString("hex"),
      );

      // Submit both reports
      const input1 = fhevm.createEncryptedInput(bbAddr, signers[2].address);
      input1.add8(1);
      input1.add8(2);
      const enc1 = await input1.encrypt();

      const tx1 = await bb
        .connect(signers[2])
        .submitReport(
          ethers.randomBytes(32),
          encrypted1.encryptedProtocol,
          encrypted1.encryptedContractAddress,
          enc1.handles[0],
          enc1.handles[1],
          enc1.inputProof,
          encrypted1.encryptedTitle,
          encrypted1.encryptedDescription,
          encrypted1.encryptedPoC,
          encrypted1.encryptedGistLink,
          encrypted1.encryptedAttachments,
          key1ForAdmin,
        );

      const input2 = fhevm.createEncryptedInput(bbAddr, signers[2].address);
      input2.add8(2);
      input2.add8(3);
      const enc2 = await input2.encrypt();

      const tx2 = await bb
        .connect(signers[2])
        .submitReport(
          ethers.randomBytes(32),
          encrypted2.encryptedProtocol,
          encrypted2.encryptedContractAddress,
          enc2.handles[0],
          enc2.handles[1],
          enc2.inputProof,
          encrypted2.encryptedTitle,
          encrypted2.encryptedDescription,
          encrypted2.encryptedPoC,
          encrypted2.encryptedGistLink,
          encrypted2.encryptedAttachments,
          key2ForAdmin,
        );

      const receipt1 = await tx1.wait();
      const receipt2 = await tx2.wait();
      const sid1 = (
        receipt1?.logs.find(
          (l: any) => l.fragment?.name === "ReportSubmitted",
        ) as any
      ).args[0];
      const sid2 = (
        receipt2?.logs.find(
          (l: any) => l.fragment?.name === "ReportSubmitted",
        ) as any
      ).args[0];

      // Admin can decrypt both independently
      const adminDecryption = new AdminDecryption(adminKeys.privateKey);

      const retrievedKey1 = await bb
        .connect(signers[1])
        .getEncryptedSymmetricKey(sid1);
      const retrievedKey2 = await bb
        .connect(signers[1])
        .getEncryptedSymmetricKey(sid2);

      const symmetricKey1 = adminDecryption.decryptSymmetricKey(
        Buffer.from(retrievedKey1.slice(2), "hex"),
      );
      const symmetricKey2 = adminDecryption.decryptSymmetricKey(
        Buffer.from(retrievedKey2.slice(2), "hex"),
      );

      const decrypted1 = adminDecryption.decryptReport(symmetricKey1, {
        encryptedProtocol: Buffer.from(encrypted1.encryptedProtocol),
        encryptedContractAddress: Buffer.from(
          encrypted1.encryptedContractAddress,
        ),
        encryptedTitle: Buffer.from(encrypted1.encryptedTitle),
        encryptedDescription: Buffer.from(encrypted1.encryptedDescription),
        encryptedPoC: Buffer.from(encrypted1.encryptedPoC),
        encryptedGistLink: Buffer.from(encrypted1.encryptedGistLink),
        encryptedAttachments: Buffer.from(encrypted1.encryptedAttachments),
      });

      const decrypted2 = adminDecryption.decryptReport(symmetricKey2, {
        encryptedProtocol: Buffer.from(encrypted2.encryptedProtocol),
        encryptedContractAddress: Buffer.from(
          encrypted2.encryptedContractAddress,
        ),
        encryptedTitle: Buffer.from(encrypted2.encryptedTitle),
        encryptedDescription: Buffer.from(encrypted2.encryptedDescription),
        encryptedPoC: Buffer.from(encrypted2.encryptedPoC),
        encryptedGistLink: Buffer.from(encrypted2.encryptedGistLink),
        encryptedAttachments: Buffer.from(encrypted2.encryptedAttachments),
      });

      expect(decrypted1.title).to.equal("Bug1");
      expect(decrypted2.title).to.equal("Bug2");
      expect(decrypted1.description).to.equal("Desc1");
      expect(decrypted2.description).to.equal("Desc2");
    });

    it("AES-GCM authentication: tampered ciphertext fails to decrypt", async () => {
      const reportData = {
        protocol: "Test",
        contractAddress: "0x123",
        title: "Original Title",
        description: "Original Description",
        poc: "PoC",
        gistLink: "",
        attachments: "",
      };

      const encryption = new BugReportEncryption();
      const encryptedReport = encryption.encryptReport(reportData);

      // Tamper with encrypted data (flip a bit)
      const tamperedTitle = Buffer.from(encryptedReport.encryptedTitle);
      tamperedTitle[20] ^= 0xff; // Flip bits

      // Admin tries to decrypt tampered data → should fail authentication
      const adminDecryption = new AdminDecryption(adminKeys.privateKey);
      const symmetricKey = encryption.getSymmetricKey();

      expect(() => {
        adminDecryption.decryptReport(symmetricKey, {
          encryptedProtocol: Buffer.from(encryptedReport.encryptedProtocol),
          encryptedContractAddress: Buffer.from(
            encryptedReport.encryptedContractAddress,
          ),
          encryptedTitle: tamperedTitle, // Tampered!
          encryptedDescription: Buffer.from(
            encryptedReport.encryptedDescription,
          ),
          encryptedPoC: Buffer.from(encryptedReport.encryptedPoC),
        });
      }).to.throw(); // AES-GCM auth tag verification fails
    });
  });

  // ── Access Control & Security Tests
  // ─────────────────────────────────────────────────────────
  describe("Access Control: Non-Admin & Non-Reporter Cannot Decrypt", () => {
    let adminKeys: RSAKeyPair;
    let submissionId: string;
    let encryptedReport: any;
    let encryptedSymmetricKey: Uint8Array;
    let reportEncryption: BugReportEncryption;

    beforeEach(async () => {
      // Setup: Admin sets public key, reporter submits encrypted report
      adminKeys = generateRSAKeyPair();
      await bb.connect(signers[1]).setAdminPublicKey(adminKeys.publicKey);

      const reportData = {
        protocol: "Confidential Protocol",
        contractAddress: "0xSecretAddress",
        title: "Private Vulnerability Report",
        description: "Sensitive security details",
        poc: "Secret exploit code",
        gistLink: "https://private-gist.com/abc",
        attachments: "ipfs://secret-files",
      };

      reportEncryption = new BugReportEncryption();
      encryptedReport = reportEncryption.encryptReport(reportData);
      encryptedSymmetricKey = reportEncryption.encryptKeyForAdmin(
        adminKeys.publicKey,
      );

      const input = fhevm.createEncryptedInput(bbAddr, signers[2].address);
      input.add8(1);
      input.add8(3);
      const { handles, inputProof } = await input.encrypt();

      const tx = await bb
        .connect(signers[2])
        .submitReport(
          ethers.randomBytes(32),
          encryptedReport.encryptedProtocol,
          encryptedReport.encryptedContractAddress,
          handles[0],
          handles[1],
          inputProof,
          encryptedReport.encryptedTitle,
          encryptedReport.encryptedDescription,
          encryptedReport.encryptedPoC,
          encryptedReport.encryptedGistLink,
          encryptedReport.encryptedAttachments,
          encryptedSymmetricKey,
        );

      const receipt = await tx.wait();
      const event = receipt?.logs.find(
        (l: any) => l.fragment?.name === "ReportSubmitted",
      );
      submissionId = (event as any).args[0];
    });

    it("non-admin cannot retrieve encrypted symmetric key from contract", async () => {
      // signers[3] is not admin (admin is signers[1])
      await expect(
        bb.connect(signers[3]).getEncryptedSymmetricKey(submissionId),
      ).to.be.revertedWith("Not admin");
    });

    it("non-reporter cannot decrypt without symmetric key", async () => {
      // Attacker (signers[4]) tries to decrypt with their own RSA key pair
      const attackerKeys = generateRSAKeyPair();
      const attackerDecryption = new AdminDecryption(attackerKeys.privateKey);

      // Even if attacker has encrypted symmetric key, they can't decrypt it
      expect(() => {
        attackerDecryption.decryptSymmetricKey(
          Buffer.from(encryptedSymmetricKey),
        );
      }).to.throw(); // RSA decryption fails - wrong private key

      // Even if attacker generates random symmetric key, AES decryption will fail
      const randomKey = Buffer.from(ethers.randomBytes(32));
      expect(() => {
        attackerDecryption.decryptReport(randomKey, {
          encryptedProtocol: Buffer.from(encryptedReport.encryptedProtocol),
          encryptedContractAddress: Buffer.from(
            encryptedReport.encryptedContractAddress,
          ),
          encryptedTitle: Buffer.from(encryptedReport.encryptedTitle),
          encryptedDescription: Buffer.from(
            encryptedReport.encryptedDescription,
          ),
          encryptedPoC: Buffer.from(encryptedReport.encryptedPoC),
          encryptedGistLink: Buffer.from(encryptedReport.encryptedGistLink),
          encryptedAttachments: Buffer.from(
            encryptedReport.encryptedAttachments,
          ),
        });
      }).to.throw(); // AES-GCM decryption fails - wrong key
    });

    it("another reporter cannot decrypt someone else's report", async () => {
      // signers[5] is a different reporter (original reporter is signers[2])

      // They cannot decrypt it without the symmetric key
      const otherReporterDecryption = new AdminDecryption(Buffer.alloc(0));
      const randomKey = Buffer.from(ethers.randomBytes(32));

      expect(() => {
        otherReporterDecryption.decryptReport(randomKey, {
          encryptedProtocol: Buffer.from(encryptedReport.encryptedProtocol),
          encryptedContractAddress: Buffer.from(
            encryptedReport.encryptedContractAddress,
          ),
          encryptedTitle: Buffer.from(encryptedReport.encryptedTitle),
          encryptedDescription: Buffer.from(
            encryptedReport.encryptedDescription,
          ),
          encryptedPoC: Buffer.from(encryptedReport.encryptedPoC),
          encryptedGistLink: Buffer.from(encryptedReport.encryptedGistLink),
          encryptedAttachments: Buffer.from(
            encryptedReport.encryptedAttachments,
          ),
        });
      }).to.throw();
    });

    it("reporter without backup key cannot decrypt after submission", async () => {
      // Reporter (signers[2]) loses their backed-up symmetric key
      // They cannot recover it from on-chain data without admin's private key

      // Contract provides encrypted symmetric key, but only admin can decrypt it
      await expect(
        bb.connect(signers[2]).getEncryptedSymmetricKey(submissionId),
      ).to.be.revertedWith("Not admin"); // Reporter cannot retrieve it

      // Even if reporter somehow gets the encrypted key, they can't decrypt it
      const reporterDecryption = new AdminDecryption(Buffer.alloc(0));
      expect(() => {
        reporterDecryption.decryptSymmetricKey(
          Buffer.from(encryptedSymmetricKey),
        );
      }).to.throw(); // No admin private key
    });

    it("only admin with correct private key can decrypt symmetric key", async () => {
      // ONLY admin (signers[1]) with matching private key can decrypt
      const adminDecryption = new AdminDecryption(adminKeys.privateKey);

      const retrievedEncryptedKey = await bb
        .connect(signers[1])
        .getEncryptedSymmetricKey(submissionId);

      // Should NOT throw
      const symmetricKey = adminDecryption.decryptSymmetricKey(
        Buffer.from(retrievedEncryptedKey.slice(2), "hex"),
      );

      // Verify key is 32 bytes (256 bits)
      expect(symmetricKey.length).to.equal(32);

      // Verify admin can decrypt report with this key
      const decrypted = adminDecryption.decryptReport(symmetricKey, {
        encryptedProtocol: Buffer.from(encryptedReport.encryptedProtocol),
        encryptedContractAddress: Buffer.from(
          encryptedReport.encryptedContractAddress,
        ),
        encryptedTitle: Buffer.from(encryptedReport.encryptedTitle),
        encryptedDescription: Buffer.from(encryptedReport.encryptedDescription),
        encryptedPoC: Buffer.from(encryptedReport.encryptedPoC),
        encryptedGistLink: Buffer.from(encryptedReport.encryptedGistLink),
        encryptedAttachments: Buffer.from(encryptedReport.encryptedAttachments),
      });

      expect(decrypted.title).to.equal("Private Vulnerability Report");
      expect(decrypted.description).to.equal("Sensitive security details");
    });

    it("encrypted data doesn't leak plaintext (string search fails)", async () => {
      // Verify encrypted data doesn't contain plaintext substrings
      const encryptedTitleHex = ethers.hexlify(encryptedReport.encryptedTitle);
      const encryptedDescHex = ethers.hexlify(
        encryptedReport.encryptedDescription,
      );
      const encryptedPoCHex = ethers.hexlify(encryptedReport.encryptedPoC);

      // Check plaintext doesn't appear in ciphertext
      expect(encryptedTitleHex).to.not.include(
        Buffer.from("Private").toString("hex"),
      );
      expect(encryptedTitleHex).to.not.include(
        Buffer.from("Vulnerability").toString("hex"),
      );
      expect(encryptedDescHex).to.not.include(
        Buffer.from("Sensitive").toString("hex"),
      );
      expect(encryptedPoCHex).to.not.include(
        Buffer.from("Secret").toString("hex"),
      );
      expect(encryptedPoCHex).to.not.include(
        Buffer.from("exploit").toString("hex"),
      );
    });

    it("brute force attack: trying random keys fails efficiently", async () => {
      const attacker = new AdminDecryption(Buffer.alloc(0));

      // Attacker tries 10 random keys (in practice, 2^256 keyspace is infeasible)
      for (let i = 0; i < 10; i++) {
        const randomKey = Buffer.from(ethers.randomBytes(32));

        expect(() => {
          attacker.decryptReport(randomKey, {
            encryptedProtocol: Buffer.from(encryptedReport.encryptedProtocol),
            encryptedContractAddress: Buffer.from(
              encryptedReport.encryptedContractAddress,
            ),
            encryptedTitle: Buffer.from(encryptedReport.encryptedTitle),
            encryptedDescription: Buffer.from(
              encryptedReport.encryptedDescription,
            ),
            encryptedPoC: Buffer.from(encryptedReport.encryptedPoC),
            encryptedGistLink: Buffer.from(encryptedReport.encryptedGistLink),
            encryptedAttachments: Buffer.from(
              encryptedReport.encryptedAttachments,
            ),
          });
        }).to.throw(); // AES-GCM auth tag fails for wrong key
      }
    });
  });
});
