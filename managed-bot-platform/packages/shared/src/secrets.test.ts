import { describe, it, expect } from "vitest";
import { encrypt, decrypt, rotateKeyPlan } from "./secrets.js";

const TEST_MASTER_KEY = "test-master-key-that-is-at-least-32-characters-long";

describe("secrets", () => {
  describe("encrypt/decrypt roundtrip", () => {
    it("encrypts and decrypts a simple string", () => {
      const plaintext = "hello world";
      const ciphertext = encrypt(plaintext, TEST_MASTER_KEY);
      const result = decrypt(ciphertext, TEST_MASTER_KEY);
      expect(result).toBe(plaintext);
    });

    it("encrypts and decrypts an empty string", () => {
      const plaintext = "";
      const ciphertext = encrypt(plaintext, TEST_MASTER_KEY);
      const result = decrypt(ciphertext, TEST_MASTER_KEY);
      expect(result).toBe(plaintext);
    });

    it("encrypts and decrypts unicode content", () => {
      const plaintext = "🔑 secret données secrètes 秘密";
      const ciphertext = encrypt(plaintext, TEST_MASTER_KEY);
      const result = decrypt(ciphertext, TEST_MASTER_KEY);
      expect(result).toBe(plaintext);
    });

    it("encrypts and decrypts a long API key", () => {
      const plaintext = "sk-proj-" + "a".repeat(200);
      const ciphertext = encrypt(plaintext, TEST_MASTER_KEY);
      const result = decrypt(ciphertext, TEST_MASTER_KEY);
      expect(result).toBe(plaintext);
    });

    it("produces different ciphertext for the same plaintext (random salt/IV)", () => {
      const plaintext = "deterministic-test";
      const c1 = encrypt(plaintext, TEST_MASTER_KEY);
      const c2 = encrypt(plaintext, TEST_MASTER_KEY);
      expect(c1).not.toBe(c2);
      expect(decrypt(c1, TEST_MASTER_KEY)).toBe(plaintext);
      expect(decrypt(c2, TEST_MASTER_KEY)).toBe(plaintext);
    });

    it("ciphertext format is salt:iv:tag:data (4 base64 parts)", () => {
      const ciphertext = encrypt("test", TEST_MASTER_KEY);
      const parts = ciphertext.split(":");
      expect(parts).toHaveLength(4);
      for (const part of parts) {
        expect(() => Buffer.from(part, "base64")).not.toThrow();
      }
    });
  });

  describe("error cases", () => {
    it("fails to decrypt with wrong key", () => {
      const ciphertext = encrypt("secret", TEST_MASTER_KEY);
      const wrongKey = "wrong-master-key-that-is-at-least-32-characters-long";
      expect(() => decrypt(ciphertext, wrongKey)).toThrow();
    });

    it("fails to decrypt malformed ciphertext", () => {
      expect(() => decrypt("not:valid:format", TEST_MASTER_KEY)).toThrow(
        "Invalid ciphertext format",
      );
    });

    it("fails to decrypt tampered ciphertext", () => {
      const ciphertext = encrypt("secret", TEST_MASTER_KEY);
      const parts = ciphertext.split(":");
      // Tamper with the encrypted data
      parts[3] = Buffer.from("tampered").toString("base64");
      expect(() => decrypt(parts.join(":"), TEST_MASTER_KEY)).toThrow();
    });
  });

  describe("rotateKeyPlan", () => {
    it("returns a description of the rotation plan", () => {
      const plan = rotateKeyPlan();
      expect(plan.description).toContain("Key rotation");
      expect(plan.description).toContain("re-encrypt");
    });
  });
});
