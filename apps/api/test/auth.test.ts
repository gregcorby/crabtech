import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, uniqueEmail } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("POST /auth/signup", () => {
  it("creates a new user and returns session cookie", async () => {
    const email = uniqueEmail();
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email, password: "testpass123" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(email);
    expect(body.user.id).toBeDefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects duplicate email", async () => {
    const email = uniqueEmail();
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email, password: "testpass123" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email, password: "testpass123" },
    });

    expect(res.statusCode).toBe(409);
  });

  it("rejects short password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: uniqueEmail(), password: "short" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "not-an-email", password: "testpass123" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /auth/login", () => {
  const email = `login-test-${Date.now()}@example.com`;
  const password = "testpass123";

  beforeAll(async () => {
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email, password },
    });
  });

  it("logs in with correct credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe(email);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "wrongpassword" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects non-existent email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nonexistent@example.com", password: "testpass123" },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("clears session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/logout",
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});

describe("GET /auth/me", () => {
  it("returns current user with valid session", async () => {
    const email = uniqueEmail();
    const signupRes = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email, password: "testpass123" },
    });

    const cookie = (signupRes.headers["set-cookie"] as string).split(";")[0];

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe(email);
  });

  it("rejects unauthenticated request", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
    });

    expect(res.statusCode).toBe(401);
  });
});
