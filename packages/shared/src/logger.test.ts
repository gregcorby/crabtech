import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "./logger.js";

describe("logger redaction", () => {
  let consoleOutput: string[];

  beforeEach(() => {
    consoleOutput = [];
    vi.spyOn(console, "info").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    vi.spyOn(console, "warn").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    vi.spyOn(console, "error").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    vi.spyOn(console, "debug").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
  });

  it("redacts OpenAI-style API keys in message", () => {
    const logger = createLogger("test");
    const sentinel = "sk-abcdefghijklmnopqrstuvwx";
    logger.info(`Using key ${sentinel} for request`);

    expect(consoleOutput.length).toBe(1);
    expect(consoleOutput[0]).not.toContain(sentinel);
    expect(consoleOutput[0]).toContain("[REDACTED]");
  });

  it("redacts GitHub PATs in message", () => {
    const logger = createLogger("test");
    const sentinel = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    logger.info(`Token: ${sentinel}`);

    expect(consoleOutput[0]).not.toContain(sentinel);
    expect(consoleOutput[0]).toContain("[REDACTED]");
  });

  it("redacts Slack bot tokens in message", () => {
    const logger = createLogger("test");
    const sentinel = "xoxb-123456789012-abcdefghij";
    logger.info(`Slack token: ${sentinel}`);

    expect(consoleOutput[0]).not.toContain(sentinel);
    expect(consoleOutput[0]).toContain("[REDACTED]");
  });

  it("redacts DigitalOcean PATs in message", () => {
    const logger = createLogger("test");
    const sentinel = "dop_v1_" + "a".repeat(64);
    logger.info(`DO token: ${sentinel}`);

    expect(consoleOutput[0]).not.toContain(sentinel);
    expect(consoleOutput[0]).toContain("[REDACTED]");
  });

  it("redacts sensitive fields in data object", () => {
    const logger = createLogger("test");
    const sentinelPassword = "super-secret-password-123";
    const sentinelApiKey = "my-api-key-value";
    const sentinelToken = "bearer-token-value";

    logger.info("User action", {
      password: sentinelPassword,
      apiKey: sentinelApiKey,
      token: sentinelToken,
      safeField: "this-is-fine",
    });

    const output = consoleOutput[0];
    expect(output).not.toContain(sentinelPassword);
    expect(output).not.toContain(sentinelApiKey);
    expect(output).not.toContain(sentinelToken);
    expect(output).toContain("this-is-fine");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts password_hash field", () => {
    const logger = createLogger("test");
    const sentinel = "$2b$12$hash-value-here";
    logger.info("User data", { password_hash: sentinel });

    expect(consoleOutput[0]).not.toContain(sentinel);
    expect(consoleOutput[0]).toContain("[REDACTED]");
  });

  it("redacts valueEncrypted field", () => {
    const logger = createLogger("test");
    const sentinel = "encrypted:data:goes:here";
    logger.info("Secret stored", { valueEncrypted: sentinel });

    expect(consoleOutput[0]).not.toContain(sentinel);
    expect(consoleOutput[0]).toContain("[REDACTED]");
  });

  it("redacts SECRETS_MASTER_KEY field", () => {
    const logger = createLogger("test");
    const sentinel = "master-key-super-long-secret-value";
    logger.info("Config", { SECRETS_MASTER_KEY: sentinel });

    expect(consoleOutput[0]).not.toContain(sentinel);
    expect(consoleOutput[0]).toContain("[REDACTED]");
  });

  it("redacts nested objects", () => {
    const logger = createLogger("test");
    const sentinel = "nested-secret-value";
    logger.info("Nested", {
      config: { secret: sentinel } as unknown as string,
    });

    // The field "secret" is in REDACT_FIELDS, so should be redacted
    expect(consoleOutput[0]).not.toContain(sentinel);
  });

  it("preserves non-sensitive data", () => {
    const logger = createLogger("test");
    logger.info("Safe message", { userId: "user-123", action: "login" });

    const output = consoleOutput[0];
    expect(output).toContain("user-123");
    expect(output).toContain("login");
    expect(output).toContain("Safe message");
  });

  it("outputs valid JSON", () => {
    const logger = createLogger("test");
    logger.info("Test message", { key: "value" });

    const parsed = JSON.parse(consoleOutput[0]);
    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("level", "info");
    expect(parsed).toHaveProperty("message");
  });

  it("includes context prefix", () => {
    const logger = createLogger("mymodule");
    logger.info("hello");

    const parsed = JSON.parse(consoleOutput[0]);
    expect(parsed.message).toContain("[mymodule]");
  });
});
