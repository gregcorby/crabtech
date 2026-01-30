import type { FastifyInstance } from "fastify";
import { BadRequestError, NotFoundError } from "@managed-bot/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, getUser } from "../lib/auth.js";

export async function billingRoutes(app: FastifyInstance) {
  app.get("/status", { preHandler: [requireAuth] }, async (request) => {
    const { userId } = getUser(request);
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    if (!subscription) {
      throw new NotFoundError("No subscription found");
    }

    return {
      subscription: {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      },
    };
  });

  app.post("/checkout", { preHandler: [requireAuth] }, async (request) => {
    const { userId } = getUser(request);

    // Stub: In production, create a Stripe checkout session
    // For now, return a placeholder URL
    return {
      checkoutUrl: `https://checkout.stripe.com/placeholder?user=${userId}`,
    };
  });

  app.post("/webhook", async (request) => {
    // Stub: In production, verify Stripe webhook signature
    const signature = request.headers["stripe-signature"];
    if (!signature) {
      throw new BadRequestError("Missing stripe-signature header");
    }

    const body = request.body as Record<string, unknown>;
    const eventType = body.type as string | undefined;

    if (!eventType) {
      throw new BadRequestError("Missing event type");
    }

    // Stub handlers for webhook events
    switch (eventType) {
      case "checkout.session.completed": {
        // Activate subscription
        const customerId = (body.data as Record<string, unknown>)?.customer as string;
        if (customerId) {
          await prisma.subscription.updateMany({
            where: { providerCustomerId: customerId },
            data: { status: "active" },
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const customerId = (body.data as Record<string, unknown>)?.customer as string;
        if (customerId) {
          await prisma.subscription.updateMany({
            where: { providerCustomerId: customerId },
            data: { status: "past_due" },
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const customerId = (body.data as Record<string, unknown>)?.customer as string;
        if (customerId) {
          await prisma.subscription.updateMany({
            where: { providerCustomerId: customerId },
            data: { status: "canceled" },
          });
        }
        break;
      }
      default:
        // Ignore unhandled event types
        break;
    }

    return { received: true };
  });
}
