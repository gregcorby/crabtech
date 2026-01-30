import { describe, it, expect } from "vitest";
import { renderCloudInit, renderDockerCompose, renderHealthCheck } from "./renderer.js";
import type { BootstrapParams } from "./types.js";

const validParams: BootstrapParams = {
  botId: "test-bot-123",
  gatewayToken: "gw-token-abc",
  clawdbotVersion: "1.2.3",
  modelProviderKey: "sk-test-key",
  modelProvider: "openai",
  systemInstructions: "You are a helpful assistant.",
  volumeDevice: "/dev/sda1",
  mountPath: "/data",
};

describe("renderCloudInit", () => {
  it("renders cloud-init with all variables substituted", () => {
    const result = renderCloudInit(validParams);

    expect(result).toContain("gw-token-abc");
    expect(result).toContain("1.2.3");
    expect(result).toContain("sk-test-key");
    expect(result).toContain("openai");
    expect(result).toContain("You are a helpful assistant.");
    expect(result).toContain("/dev/sda1");
    expect(result).toContain("/data");
  });

  it("contains no unsubstituted template variables", () => {
    const result = renderCloudInit(validParams);
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("is valid cloud-init (starts with #cloud-config)", () => {
    const result = renderCloudInit(validParams);
    expect(result.trimStart()).toMatch(/^#cloud-config/);
  });

  it("contains docker compose service definition", () => {
    const result = renderCloudInit(validParams);
    expect(result).toContain("clawdbot");
    expect(result).toContain("docker compose");
  });

  it("uses defaults for optional params", () => {
    const minParams: BootstrapParams = {
      botId: "bot-min",
      gatewayToken: "token-min",
      clawdbotVersion: "latest",
      volumeDevice: "/dev/sda1",
      mountPath: "/data",
    };
    const result = renderCloudInit(minParams);
    expect(result).toContain("token-min");
    expect(result).toContain("latest");
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("includes systemd service for clawdbot", () => {
    const result = renderCloudInit(validParams);
    expect(result).toContain("clawdbot.service");
    expect(result).toContain("systemctl enable");
  });

  it("includes Docker installation steps", () => {
    const result = renderCloudInit(validParams);
    expect(result).toContain("docker-ce");
    expect(result).toContain("apt-get install");
  });
});

describe("renderDockerCompose", () => {
  it("renders docker-compose with all variables substituted", () => {
    const result = renderDockerCompose(validParams);

    expect(result).toContain("1.2.3");
    expect(result).toContain("gw-token-abc");
    expect(result).toContain("openai");
    expect(result).toContain("/data");
  });

  it("contains no unsubstituted template variables", () => {
    const result = renderDockerCompose(validParams);
    expect(result).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("defines the clawdbot service", () => {
    const result = renderDockerCompose(validParams);
    expect(result).toContain("clawdbot");
    expect(result).toContain("8080");
  });

  it("mounts the data volume", () => {
    const result = renderDockerCompose(validParams);
    expect(result).toContain("/data:/data");
  });
});

describe("renderHealthCheck", () => {
  it("renders health check script", () => {
    const result = renderHealthCheck();
    expect(result).toContain("#!/bin/bash");
    expect(result).toContain("health");
    expect(result).toContain("curl");
  });

  it("includes retry logic", () => {
    const result = renderHealthCheck();
    expect(result).toContain("MAX_RETRIES");
    expect(result).toContain("RETRY_DELAY");
  });
});
