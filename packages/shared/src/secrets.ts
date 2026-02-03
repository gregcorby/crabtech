import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, KEY_LENGTH);
}

function getMasterKey(): string {
  const key = process.env.SECRETS_MASTER_KEY;
  if (!key || key.length < 32) {
    throw new Error("SECRETS_MASTER_KEY must be set and at least 32 characters");
  }
  return key;
}

export function encrypt(plaintext: string, masterKeyOverride?: string): string {
  const masterKey = masterKeyOverride ?? getMasterKey();
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: salt:iv:tag:ciphertext (all base64)
  return [
    salt.toString("base64"),
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(ciphertext: string, masterKeyOverride?: string): string {
  const masterKey = masterKeyOverride ?? getMasterKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid ciphertext format");
  }

  const salt = Buffer.from(parts[0], "base64");
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const encrypted = Buffer.from(parts[3], "base64");

  const key = deriveKey(masterKey, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function rotateKeyPlan(): { description: string } {
  return {
    description:
      "Key rotation: re-encrypt all bot_secrets rows with new master key. " +
      "Requires: read old key, decrypt all, re-encrypt with new key, atomic swap.",
  };
}
