/**
 * @file src/utils/emailCrypto.ts
 * @description AES-256-CBC encryption / decryption for SMTP passwords.
 *
 * The SMTP_ENCRYPTION_KEY env var must be a 32-byte hex string (64 hex chars).
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * SECURITY:
 *  - Each encryption call uses a fresh random 16-byte IV.
 *  - The stored string is `iv:ciphertext` (both hex).
 *  - Passwords are NEVER logged.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16; // AES block size

// ─── Key resolution ───────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw = process.env.SMTP_ENCRYPTION_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      "[emailCrypto] SMTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(raw, "hex");
}

// ─── Encrypt ─────────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext SMTP password for storage.
 * Returns an empty string if given an empty input (no-op for unset passwords).
 */
export function encryptSmtpPassword(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  // Store as iv:ciphertext (both hex)
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

// ─── Decrypt ─────────────────────────────────────────────────────────────────

/**
 * Decrypts a stored SMTP password for transporter creation.
 * Returns empty string for empty input.
 * Throws on tampered / malformed ciphertext.
 */
export function decryptSmtpPassword(stored: string): string {
  if (!stored) return "";
  const parts = stored.split(":");
  if (parts.length !== 2) {
    throw new Error("[emailCrypto] Malformed encrypted password (expected iv:ciphertext)");
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = Buffer.from(parts[1], "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString("utf8");
}
