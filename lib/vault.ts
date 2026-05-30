// lib/vault.ts
// AES-256-GCM encryption for Delta API credentials
// NEVER log, NEVER return to frontend, ONLY decrypt server-side during order placement

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const key = process.env.VAULT_KEY;
  if (!key) throw new Error("VAULT_KEY not set in environment");
  if (key.length !== 64) throw new Error("VAULT_KEY must be 64-char hex (32 bytes)");
  return Buffer.from(key, "hex");
}

/** Encrypt plaintext → "iv:authTag:ciphertext" (all hex) */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/** Decrypt "iv:authTag:ciphertext" → plaintext */
export function decrypt(data: string): string {
  const key = getKey();
  const parts = data.split(":");
  if (parts.length !== 3) throw new Error("Invalid vault format");
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}

/** Returns true if value looks like an encrypted vault blob */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts[0].length === 24 && parts[1].length === 32;
}
