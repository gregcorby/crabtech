import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { createTestApp, signupAndGetCookie, uniqueEmail } from "./helpers.js";

let app: FastifyInstance;
const prisma = new PrismaClient();

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /bot/create", () => {
  it("requires authentication", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/bot/create",
      payload: { name: "My Bot" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("requires active subscription", async () => {
    const email = uniqueEmail();
    const cookie = await signupAndGetCookie(app, email, "testpass123");

    // Subscription is inactive by default after signup
    const res = await app.inject({
      method: "POST",
      url: "/bot/create",
      headers: { cookie },
      payload: { name: "My Bot" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("creates a bot with active subscription", async () => {
    const email = uniqueEmail();
    const cookie = await signupAndGetCookie(app, email, "testpass123");

    // Activate subscription directly in DB
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.subscription.update({
      where: { userId: user!.id },
      data: { status: "active" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/bot/create",
      headers: { cookie },
      payload: { name: "My Bot" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bot.name).toBe("My Bot");
    expect(body.bot.status).toBe("provisioning");
  });

  it("enforces one bot per user", async () => {
    const email = uniqueEmail();
    const cookie = await signupAndGetCookie(app, email, "testpass123");

    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.subscription.update({
      where: { userId: user!.id },
      data: { status: "active" },
    });

    // Create first bot
    const res1 = await app.inject({
      method: "POST",
      url: "/bot/create",
      headers: { cookie },
      payload: { name: "Bot 1" },
    });
    expect(res1.statusCode).toBe(200);

    // Attempt second bot
    const res2 = await app.inject({
      method: "POST",
      url: "/bot/create",
      headers: { cookie },
      payload: { name: "Bot 2" },
    });
    expect(res2.statusCode).toBe(409);
  });
});

describe("GET /bot/status", () => {
  it("requires authentication", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/bot/status",
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when no bot exists", async () => {
    const email = uniqueEmail();
    const cookie = await signupAndGetCookie(app, email, "testpass123");

    const res = await app.inject({
      method: "GET",
      url: "/bot/status",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns bot status after creation", async () => {
    const email = uniqueEmail();
    const cookie = await signupAndGetCookie(app, email, "testpass123");

    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.subscription.update({
      where: { userId: user!.id },
      data: { status: "active" },
    });

    await app.inject({
      method: "POST",
      url: "/bot/create",
      headers: { cookie },
      payload: { name: "Status Bot" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/bot/status",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.bot.name).toBe("Status Bot");
    expect(body.bot.status).toBe("provisioning");
    expect(body.secrets).toEqual([]);
  });
});

describe("cross-tenant authorization", () => {
  it("user A cannot see user B's bot via /bot/status", async () => {
    // User A creates a bot
    const emailA = uniqueEmail();
    const cookieA = await signupAndGetCookie(app, emailA, "testpass123");
    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    await prisma.subscription.update({
      where: { userId: userA!.id },
      data: { status: "active" },
    });
    await app.inject({
      method: "POST",
      url: "/bot/create",
      headers: { cookie: cookieA },
      payload: { name: "A's Bot" },
    });

    // User B tries to access bot status - should see 404 (no bot for B)
    const emailB = uniqueEmail();
    const cookieB = await signupAndGetCookie(app, emailB, "testpass123");

    const res = await app.inject({
      method: "GET",
      url: "/bot/status",
      headers: { cookie: cookieB },
    });

    expect(res.statusCode).toBe(404);
  });

  it("user A cannot stop user B's bot", async () => {
    const emailA = uniqueEmail();
    const cookieA = await signupAndGetCookie(app, emailA, "testpass123");
    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    await prisma.subscription.update({
      where: { userId: userA!.id },
      data: { status: "active" },
    });
    await app.inject({
      method: "POST",
      url: "/bot/create",
      headers: { cookie: cookieA },
      payload: { name: "A's Bot" },
    });

    // Set bot to running so stop would work
    const botA = await prisma.bot.findUnique({ where: { userId: userA!.id } });
    await prisma.bot.update({ where: { id: botA!.id }, data: { status: "running" } });

    // User B tries to stop - should fail (no bot for B)
    const emailB = uniqueEmail();
    const cookieB = await signupAndGetCookie(app, emailB, "testpass123");

    const res = await app.inject({
      method: "POST",
      url: "/bot/stop",
      headers: { cookie: cookieB },
    });

    // Should be 404 not found (B has no bot), not a success or wrong error
    expect(res.statusCode).toBe(404);
  });

  it("user A cannot configure user B's bot", async () => {
    const emailA = uniqueEmail();
    const cookieA = await signupAndGetCookie(app, emailA, "testpass123");
    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    await prisma.subscription.update({
      where: { userId: userA!.id },
      data: { status: "active" },
    });
    await app.inject({
      method: "POST",
      url: "/bot/create",
      headers: { cookie: cookieA },
      payload: { name: "A's Bot" },
    });

    // User B tries to update config - should fail
    const emailB = uniqueEmail();
    const cookieB = await signupAndGetCookie(app, emailB, "testpass123");

    const res = await app.inject({
      method: "POST",
      url: "/bot/config",
      headers: { cookie: cookieB },
      payload: { apiKey: "stolen-key" },
    });

    expect(res.statusCode).toBe(404);
  });
});
