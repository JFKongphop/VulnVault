import { poseidon2, poseidon4 } from 'poseidon-lite';

/**
 * Generate Poseidon commitment from secrets
 * commitment = Poseidon(secret0, secret1, impactType, severity)
 */
export function generateCommitment(
  secret0: bigint,
  secret1: bigint,
  impactType: number,
  severity: number
): bigint {
  return poseidon4([secret0, secret1, BigInt(impactType), BigInt(severity)]);
}

/**
 * Generate random secret (32 bytes)
 */
export function generateSecret(): bigint {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return BigInt('0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
}

/**
 * Generate commitment secrets
 */
export function generateSecrets() {
  return {
    secret0: generateSecret(),
    secret1: generateSecret(),
  };
}
