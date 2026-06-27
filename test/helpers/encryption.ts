import crypto from 'crypto';

/**
 * Production-grade encryption helpers for bug bounty reports
 * Implements Option 2: Dual Encryption (AES-GCM + RSA-OAEP)
 */

export interface RSAKeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
}

export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Generate RSA-2048 key pair for admin
 * In production: Generate once, store private key in HSM
 */
export function generateRSAKeyPair(): RSAKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'der'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'der'
    }
  });

  return {
    publicKey: Buffer.from(publicKey),
    privateKey: Buffer.from(privateKey)
  };
}

/**
 * Encrypt data with AES-256-GCM
 * @param symmetricKey 32-byte AES-256 key
 * @param plaintext Data to encrypt
 * @returns Encrypted data with IV and auth tag
 */
export function encryptWithAES(symmetricKey: Buffer, plaintext: string): Buffer {
  if (symmetricKey.length !== 32) {
    throw new Error('Symmetric key must be 32 bytes (AES-256)');
  }

  const iv = crypto.randomBytes(12); // GCM standard IV size (96 bits)
  const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: [iv(12) | authTag(16) | ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt data with AES-256-GCM
 * @param symmetricKey 32-byte AES-256 key
 * @param encryptedBuffer Buffer containing [iv | authTag | ciphertext]
 * @returns Decrypted plaintext
 */
export function decryptWithAES(symmetricKey: Buffer, encryptedBuffer: Buffer): string {
  if (symmetricKey.length !== 32) {
    throw new Error('Symmetric key must be 32 bytes (AES-256)');
  }

  // Parse format: [iv(12) | authTag(16) | ciphertext]
  const iv = encryptedBuffer.slice(0, 12);
  const authTag = encryptedBuffer.slice(12, 28);
  const ciphertext = encryptedBuffer.slice(28);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Encrypt symmetric key with RSA-OAEP
 * @param publicKey RSA public key in DER format
 * @param symmetricKey 32-byte AES key to encrypt
 * @returns Encrypted symmetric key (256 bytes for RSA-2048)
 */
export function encryptSymmetricKey(publicKey: Buffer, symmetricKey: Buffer): Buffer {
  if (symmetricKey.length !== 32) {
    throw new Error('Symmetric key must be 32 bytes');
  }

  const publicKeyObject = crypto.createPublicKey({
    key: publicKey,
    format: 'der',
    type: 'spki'
  });

  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyObject,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    symmetricKey
  );

  return encrypted;
}

/**
 * Decrypt symmetric key with RSA-OAEP
 * @param privateKey RSA private key in DER format
 * @param encryptedKey Encrypted symmetric key
 * @returns Decrypted 32-byte AES key
 */
export function decryptSymmetricKey(privateKey: Buffer, encryptedKey: Buffer): Buffer {
  const privateKeyObject = crypto.createPrivateKey({
    key: privateKey,
    format: 'der',
    type: 'pkcs8'
  });

  const decrypted = crypto.privateDecrypt(
    {
      key: privateKeyObject,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    encryptedKey
  );

  if (decrypted.length !== 32) {
    throw new Error('Decrypted key is not 32 bytes');
  }

  return decrypted;
}

/**
 * Complete encryption flow for bug report submission
 */
export class BugReportEncryption {
  public symmetricKey: Buffer;
  
  constructor() {
    this.symmetricKey = crypto.randomBytes(32); // Generate new AES-256 key
  }

  /**
   * Encrypt all report fields
   */
  encryptReport(report: {
    protocol: string;
    contractAddress: string;
    title: string;
    description: string;
    poc: string;
    gistLink?: string;
    attachments?: string;
  }) {
    return {
      encryptedProtocol: encryptWithAES(this.symmetricKey, report.protocol),
      encryptedContractAddress: encryptWithAES(this.symmetricKey, report.contractAddress),
      encryptedTitle: encryptWithAES(this.symmetricKey, report.title),
      encryptedDescription: encryptWithAES(this.symmetricKey, report.description),
      encryptedPoC: encryptWithAES(this.symmetricKey, report.poc),
      encryptedGistLink: report.gistLink 
        ? encryptWithAES(this.symmetricKey, report.gistLink) 
        : Buffer.from([]),
      encryptedAttachments: report.attachments
        ? encryptWithAES(this.symmetricKey, report.attachments)
        : Buffer.from([])
    };
  }

  /**
   * Encrypt symmetric key for admin
   */
  encryptKeyForAdmin(adminPublicKey: Buffer): Buffer {
    return encryptSymmetricKey(adminPublicKey, this.symmetricKey);
  }

  /**
   * Get symmetric key (for reporter's local backup)
   */
  getSymmetricKey(): Buffer {
    return this.symmetricKey;
  }
}

/**
 * Admin decryption helper
 */
export class AdminDecryption {
  constructor(private adminPrivateKey: Buffer) {}

  /**
   * Decrypt symmetric key from report
   */
  decryptSymmetricKey(encryptedKey: Buffer): Buffer {
    return decryptSymmetricKey(this.adminPrivateKey, encryptedKey);
  }

  /**
   * Decrypt all report fields
   */
  decryptReport(
    symmetricKey: Buffer,
    encryptedData: {
      encryptedProtocol: Buffer;
      encryptedContractAddress: Buffer;
      encryptedTitle: Buffer;
      encryptedDescription: Buffer;
      encryptedPoC: Buffer;
      encryptedGistLink?: Buffer;
      encryptedAttachments?: Buffer;
    }
  ) {
    return {
      protocol: decryptWithAES(symmetricKey, encryptedData.encryptedProtocol),
      contractAddress: decryptWithAES(symmetricKey, encryptedData.encryptedContractAddress),
      title: decryptWithAES(symmetricKey, encryptedData.encryptedTitle),
      description: decryptWithAES(symmetricKey, encryptedData.encryptedDescription),
      poc: decryptWithAES(symmetricKey, encryptedData.encryptedPoC),
      gistLink: encryptedData.encryptedGistLink && encryptedData.encryptedGistLink.length > 0
        ? decryptWithAES(symmetricKey, encryptedData.encryptedGistLink)
        : '',
      attachments: encryptedData.encryptedAttachments && encryptedData.encryptedAttachments.length > 0
        ? decryptWithAES(symmetricKey, encryptedData.encryptedAttachments)
        : ''
    };
  }
}
