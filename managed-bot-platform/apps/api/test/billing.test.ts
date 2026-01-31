import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import { createTestApp, signupAndGetCookie, uniqueEmail } from "./helpers.js";

let app: FastifyInstance;
const prisma = new PrismaClient();

// Mock the queue module to capture enqueued jobs
const enqueuedJobs: unknown[] = [];
vi.mock("../src/lib/queue.js", () => ({
  enqueueJob: vi.fn(async (jobData: unknown) => {
    enqueuedJobs.push(jobData);
  }),
}));

// Use a fixed webhook secret for test signature generation
const TEST_WEBHOOK_SECRET = "whsec_test_secret_for_testing";

vi.mock("../src/lib/stripe.js", async () => {
  const actual = await vi.importActual<typeof import("stripe")>("stripe");
  const stripeInstance = new actual.default("sk_test_fake", {
    apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion,
  });
  return {
    stripe: stripeInstance,
    STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
    STRIPE_PRICE_ID: "price_test_123",
  };
});

function buildWebhookPayload(
  eventType: string,
  data: Record<string, unknown>,
  eventId = `evt_test_${Date.now()}`,
) {
  return {
    id: eventId,
    object: "event",
    type: eventType,
    data: { object: data },
    api_version: "2024-11-20.acacia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  };
}

function generateSignature(payload: string, secret: string): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(() => {
  enqueuedJobs.length = 0;
});

describe("GET /billing/status", () => {
  it("requires authentication", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/billing/status",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns subscription status", async () => {
    const email = uniqueEmail();
    const cookie = await signupAndGetCookie(app, email, "testpass123");

    const res = await app.inject({
      method: "GET",
      url: "/billing/status",
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.subscription.status).toBe("inactive");
  });
});

describe("POST /billing/webhook", () => {
  it("rejects requests without stripe-signature header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      payload: { type: "test" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid signatures", async () => {
    const payload = JSON.stringify(buildWebhookPayload("test.event", {}));
    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: {
        "stripe-signature": "t=123,v1=invalid_signature",
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("handles checkout.session.completed and activates subscription", async () => {
    const email = uniqueEmail();
    const cookie = await signupAndGetCookie(app, email, "testpass123");
    const user = await prisma.user.findUnique({ where: { email } });

    const eventPayload = buildWebhookPayload("checkout.session.completed", {
      customer: "cus_test_123",
      subscription: "sub_test_123",
      metadata: { userId: user!.id },
    });

    const payloadStr = JSON.stringify(eventPayload);
    const signature = generateSignature(payloadStr, TEST_WEBHOOK_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      payload: payloadStr,
    });

    expect(res.statusCode).toBe(200);

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user!.id },
    });
    expect(subscription?.status).toBe("active");
    expect(subscription?.providerCustomerId).toBe("cus_test_123");
    expect(subscription?.providerSubscriptionId).toBe("sub_test_123");
  });

  it("skips duplicate events (idempotency)", async () => {
    const email = uniqueEmail();
    await signupAndGetCookie(app, email, "testpass123");
    const user = await prisma.user.findUnique({ where: { email } });

    const eventId = `evt_idempotency_${Date.now()}`;
    const eventPayload = buildWebhookPayload(
      "checkout.session.completed",
      {
        customer: "cus_idem_test",
        subscription: "sub_idem_test",
        metadata: { userId: user!.id },
      },
      eventId,
    );

    const payloadStr = JSON.stringify(eventPayload);
    const signature = generateSignature(payloadStr, TEST_WEBHOOK_SECRET);

    // First call
    await app.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      payload: payloadStr,
    });

    // Second call with same event ID
    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      payload: payloadStr,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.received).toBe(true);
  });

  it("enqueues SUSPEND_BOT on invoice.payment_failed", async () => {
    const email = uniqueEmail();
    await signupAndGetCookie(app, email, "testpass123");
    const user = await prisma.user.findUnique({ where: { email } });

    // Set up subscription with provider customer ID
    await prisma.subscription.update({
      where: { userId: user!.id },
      data: {
        status: "active",
        providerCustomerId: "cus_suspend_test",
      },
    });

    // Create a bot with instance
    const bot = await prisma.bot.create({
      data: {
        userId: user!.id,
        name: "Suspend Test Bot",
        status: "running",
      },
    });

    const instance = await prisma.botInstance.create({
      data: {
        botId: bot.id,
        provider: "fake",
        providerInstanceId: "fake-instance-123",
        region: "nyc1",
        size: "s-1vcpu-1gb",
        ipAddress: "10.0.0.1",
      },
    });

    const eventPayload = buildWebhookPayload("invoice.payment_failed", {
      customer: "cus_suspend_test",
    });

    const payloadStr = JSON.stringify(eventPayload);
    const signature = generateSignature(payloadStr, TEST_WEBHOOK_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      payload: payloadStr,
    });

    expect(res.statusCode).toBe(200);

    // Verify subscription marked as past_due
    const sub = await prisma.subscription.findUnique({ where: { userId: user!.id } });
    expect(sub?.status).toBe("past_due");

    // Verify SUSPEND_BOT job enqueued
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]).toMatchObject({
      type: "SUSPEND_BOT",
      botId: bot.id,
      instanceId: instance.id,
    });
  });

  it("enqueues DESTROY_BOT_SUBSCRIPTION_ENDED on customer.subscription.deleted", async () => {
    const email = uniqueEmail();
    await signupAndGetCookie(app, email, "testpass123");
    const user = await prisma.user.findUnique({ where: { email } });

    await prisma.subscription.update({
      where: { userId: user!.id },
      data: {
        status: "active",
        providerCustomerId: "cus_destroy_test",
      },
    });

    const bot = await prisma.bot.create({
      data: {
        userId: user!.id,
        name: "Destroy Test Bot",
        status: "running",
      },
    });

    const instance = await prisma.botInstance.create({
      data: {
        botId: bot.id,
        provider: "fake",
        providerInstanceId: "fake-instance-456",
        providerVolumeId: "fake-volume-456",
        region: "nyc1",
        size: "s-1vcpu-1gb",
        ipAddress: "10.0.0.2",
      },
    });

    const eventPayload = buildWebhookPayload("customer.subscription.deleted", {
      customer: "cus_destroy_test",
      status: "canceled",
      current_period_end: Math.floor(Date.now() / 1000),
    });

    const payloadStr = JSON.stringify(eventPayload);
    const signature = generateSignature(payloadStr, TEST_WEBHOOK_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      payload: payloadStr,
    });

    expect(res.statusCode).toBe(200);

    // Verify subscription marked as canceled
    const sub = await prisma.subscription.findUnique({ where: { userId: user!.id } });
    expect(sub?.status).toBe("canceled");

    // Verify DESTROY_BOT_SUBSCRIPTION_ENDED job enqueued
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]).toMatchObject({
      type: "DESTROY_BOT_SUBSCRIPTION_ENDED",
      botId: bot.id,
      instanceId: instance.id,
      volumeId: "fake-volume-456",
    });
  });
});
