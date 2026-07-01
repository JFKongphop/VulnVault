/**
 * Browser-compatible encryption utilities for bug bounty reports
 * Implements dual encryption: AES-256-GCM + RSA-OAEP
 * Uses Web Crypto API (browser-native)
 */

export interface EncryptedReportData {
  encryptedProtocol: Uint8Array<ArrayBuffer>;
  encryptedContractAddress: Uint8Array<ArrayBuffer>;
  encryptedTitle: Uint8Array<ArrayBuffer>;
  encryptedDescription: Uint8Array<ArrayBuffer>;
  encryptedPoC: Uint8Array<ArrayBuffer>;
  encryptedGistLink: Uint8Array<ArrayBuffer>;
  encryptedAttachments: Uint8Array<ArrayBuffer>;
}

/**
 * Convert ArrayBuffer or Uint8Array to hex string
 */
function bufferToHex(buffer: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const arr = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array<ArrayBuffer>
 */
function hexToBuffer(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const buf = new ArrayBuffer(clean.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt data with AES-256-GCM
 * @param symmetricKey CryptoKey (AES-256)
 * @param plaintext String to encrypt
 * @returns Buffer containing [iv(12) | authTag(16) | ciphertext]
 */
async function encryptWithAES(symmetricKey: CryptoKey, plaintext: string): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128 // 128-bit auth tag
    },
    symmetricKey,
    data
  );

  // Web Crypto API returns [ciphertext | authTag] combined
  // We prepend IV for storage: [iv(12) | ciphertext+authTag]
  const resultBuf = new ArrayBuffer(12 + ciphertext.byteLength);
  const result = new Uint8Array(resultBuf);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);

  return result;
}

/**
 * Decrypt data with AES-256-GCM
 * @param symmetricKey CryptoKey (AES-256)
 * @param encryptedBuffer Buffer containing [iv(12) | ciphertext+authTag]
 * @returns Decrypted plaintext
 */
async function decryptWithAES(symmetricKey: CryptoKey, encryptedBuffer: Uint8Array<ArrayBuffer>): Promise<string> {
  // Parse format: [iv(12) | ciphertext+authTag]
  const iv = encryptedBuffer.slice(0, 12);
  const ciphertext = encryptedBuffer.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128
    },
    symmetricKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Import RSA public key from hex string (DER format)
 */
async function importRSAPublicKey(publicKeyHex: string): Promise<CryptoKey> {
  const keyData = hexToBuffer(publicKeyHex);

  return await crypto.subtle.importKey(
    'spki',
    keyData,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256'
    },
    false,
    ['encrypt']
  );
}

/**
 * Encrypt symmetric key with RSA-OAEP
 * @param publicKeyHex Admin's RSA public key (hex string)
 * @param symmetricKeyRaw 32-byte AES key
 * @returns Encrypted symmetric key
 */
async function encryptSymmetricKey(publicKeyHex: string, symmetricKeyRaw: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const publicKey = await importRSAPublicKey(publicKeyHex);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP'
    },
    publicKey,
    symmetricKeyRaw
  );

  return new Uint8Array(encrypted as ArrayBuffer);
}

/**
 * Decrypt symmetric key with RSA-OAEP (admin private key)
 * @param encryptedKeyHex Encrypted symmetric key (hex string from contract)
 * @param privateKeyHex Admin's RSA private key (PKCS8 DER hex string)
 * @returns Decrypted symmetric key as hex string
 */
export async function decryptSymmetricKey(encryptedKeyHex: string, privateKeyHex: string): Promise<string> {
  const keyData = hexToBuffer(privateKeyHex);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );

  const encryptedBytes = hexToBuffer(encryptedKeyHex);
  const decrypted = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedBytes);
  return bufferToHex(new Uint8Array(decrypted));
}

/**
 * Complete encryption flow for bug report submission
 */
export class BugReportEncryption {
  private symmetricKey!: CryptoKey;
  private symmetricKeyRaw!: Uint8Array<ArrayBuffer>;

  /**
   * Initialize with new random AES-256 key
   */
  async initialize(): Promise<void> {
    // Generate random 256-bit key for AES-256-GCM
    this.symmetricKeyRaw = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));

    // Import as CryptoKey
    this.symmetricKey = await crypto.subtle.importKey(
      'raw',
      this.symmetricKeyRaw,
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt all report fields
   */
  async encryptReport(report: {
    protocol: string;
    contractAddress: string;
    title: string;
    description: string;
    poc: string;
    gistLink?: string;
    attachments?: string;
  }): Promise<EncryptedReportData> {
    return {
      encryptedProtocol: await encryptWithAES(this.symmetricKey, report.protocol),
      encryptedContractAddress: await encryptWithAES(this.symmetricKey, report.contractAddress),
      encryptedTitle: await encryptWithAES(this.symmetricKey, report.title),
      encryptedDescription: await encryptWithAES(this.symmetricKey, report.description),
      encryptedPoC: await encryptWithAES(this.symmetricKey, report.poc),
      encryptedGistLink: report.gistLink 
        ? await encryptWithAES(this.symmetricKey, report.gistLink)
        : new Uint8Array(new ArrayBuffer(0)),
      encryptedAttachments: report.attachments
        ? await encryptWithAES(this.symmetricKey, report.attachments)
        : new Uint8Array(new ArrayBuffer(0)),
    };
  }

  /**
   * Encrypt symmetric key for admin
   * @param adminPublicKeyHex Admin's RSA public key in hex format
   */
  async encryptKeyForAdmin(adminPublicKeyHex: string): Promise<Uint8Array<ArrayBuffer>> {
    return await encryptSymmetricKey(adminPublicKeyHex, this.symmetricKeyRaw);
  }

  /**
   * Get symmetric key as hex string (for reporter's local backup)
   */
  getSymmetricKeyHex(): string {
    return bufferToHex(this.symmetricKeyRaw);
  }

  /**
   * Get raw symmetric key bytes
   */
  getSymmetricKeyRaw(): Uint8Array<ArrayBuffer> {
    return this.symmetricKeyRaw;
  }
}

/**
 * Admin/Reporter decryption helper
 */
export class ReportDecryption {
  private symmetricKey!: CryptoKey;

  /**
   * Initialize with symmetric key (from backup)
   * @param symmetricKeyHex 64-char hex string (32 bytes)
   */
  async initialize(symmetricKeyHex: string): Promise<void> {
    const keyData = hexToBuffer(symmetricKeyHex);

    if (keyData.length !== 32) {
      throw new Error('Symmetric key must be 32 bytes (64 hex chars)');
    }

    this.symmetricKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['decrypt']
    );
  }

  /**
   * Decrypt all report fields
   */
  async decryptReport(encryptedData: {
    encryptedProtocol: Uint8Array<ArrayBuffer>;
    encryptedContractAddress: Uint8Array<ArrayBuffer>;
    encryptedTitle: Uint8Array<ArrayBuffer>;
    encryptedDescription: Uint8Array<ArrayBuffer>;
    encryptedPoC: Uint8Array<ArrayBuffer>;
    encryptedGistLink?: Uint8Array<ArrayBuffer>;
    encryptedAttachments?: Uint8Array<ArrayBuffer>;
  }): Promise<{
    protocol: string;
    contractAddress: string;
    title: string;
    description: string;
    poc: string;
    gistLink: string;
    attachments: string;
  }> {
    return {
      protocol: await decryptWithAES(this.symmetricKey, encryptedData.encryptedProtocol),
      contractAddress: await decryptWithAES(this.symmetricKey, encryptedData.encryptedContractAddress),
      title: await decryptWithAES(this.symmetricKey, encryptedData.encryptedTitle),
      description: await decryptWithAES(this.symmetricKey, encryptedData.encryptedDescription),
      poc: await decryptWithAES(this.symmetricKey, encryptedData.encryptedPoC),
      gistLink: encryptedData.encryptedGistLink && encryptedData.encryptedGistLink.length > 0
        ? await decryptWithAES(this.symmetricKey, encryptedData.encryptedGistLink)
        : '',
      attachments: encryptedData.encryptedAttachments && encryptedData.encryptedAttachments.length > 0
        ? await decryptWithAES(this.symmetricKey, encryptedData.encryptedAttachments)
        : '',
    };
  }
}

/**
 * Convert Uint8Array to hex string with 0x prefix
 */
export function toHexString(bytes: Uint8Array<ArrayBuffer>): `0x${string}` {
  return `0x${bufferToHex(bytes)}` as `0x${string}`;
}

/**
 * Convert hex string to Uint8Array
 */
export function fromHexString(hex: string): Uint8Array<ArrayBuffer> {
  return hexToBuffer(hex);
}
