import type { FastifyInstance } from "fastify";
import { BadRequestError, NotFoundError } from "@managed-bot/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, getUser } from "../lib/auth.js";
import { stripe, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID } from "../lib/stripe.js";
import { enqueueJob } from "../lib/queue.js";

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

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Ensure a subscription record exists
    await prisma.subscription.upsert({
      where: { userId },
      update: {},
      create: { userId, status: "inactive" },
    });

    const frontendUrl = process.env.CORS_ORIGIN ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: user.email,
      success_url: `${frontendUrl}/dashboard?checkout=success`,
      cancel_url: `${frontendUrl}/dashboard?checkout=canceled`,
      metadata: { userId },
    });

    return { checkoutUrl: session.url };
  });

  app.post(
    "/webhook",
    { config: { rawBody: true } },
    async (request, reply) => {
      const signature = request.headers["stripe-signature"];
      if (!signature) {
        throw new BadRequestError("Missing stripe-signature header");
      }

      const rawBody = (request as unknown as { rawBody: string }).rawBody;
      if (!rawBody) {
        throw new BadRequestError("Missing raw body for signature verification");
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      } catch {
        return reply.status(400).send({ error: "Invalid webhook signature" });
      }

      // Idempotency: skip already-processed events
      const existingEvent = await prisma.webhookEvent.findUnique({
        where: { stripeEventId: event.id },
      });
      if (existingEvent) {
        return { received: true };
      }

      // Record event as processed
      await prisma.webhookEvent.create({
        data: { stripeEventId: event.id, eventType: event.type },
      });

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const userId = session.metadata?.userId;
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id;
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;

          if (userId && customerId) {
            await prisma.subscription.update({
              where: { userId },
              data: {
                status: "active",
                providerCustomerId: customerId,
                providerSubscriptionId: subscriptionId ?? null,
              },
            });
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object;
          const customerId =
            typeof invoice.customer === "string"
              ? invoice.customer
              : invoice.customer?.id;

          if (customerId) {
            const subscription = await prisma.subscription.findFirst({
              where: { providerCustomerId: customerId },
              include: { user: { include: { bot: { include: { instance: true } } } } },
            });

            if (subscription) {
              const periodEnd = invoice.lines?.data?.[0]?.period?.end;
              const updateData: Record<string, unknown> = {};
              if (periodEnd) {
                updateData.currentPeriodEnd = new Date(periodEnd * 1000);
              }

              // Resume bot if subscription was suspended or past_due
              if (subscription.status === "past_due" || subscription.status === "suspended") {
                updateData.status = "active";
                const instance = subscription.user?.bot?.instance;
                if (instance) {
                  await enqueueJob({
                    type: "RESUME_BOT",
                    botId: subscription.user.bot!.id,
                    userId: subscription.userId,
                    instanceId: instance.id,
                    volumeId: instance.providerVolumeId,
                    region: instance.region,
                    size: instance.size,
                  });
                }
              }

              if (Object.keys(updateData).length > 0) {
                await prisma.subscription.update({
                  where: { id: subscription.id },
                  data: updateData,
                });
              }
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const customerId =
            typeof invoice.customer === "string"
              ? invoice.customer
              : invoice.customer?.id;

          if (customerId) {
            const subscription = await prisma.subscription.findFirst({
              where: { providerCustomerId: customerId },
              include: { user: { include: { bot: { include: { instance: true } } } } },
            });

            if (subscription) {
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: { status: "suspended" },
              });

              const bot = subscription.user?.bot;
              const instance = bot?.instance;
              if (bot && instance) {
                await enqueueJob({
                  type: "SUSPEND_BOT",
                  botId: bot.id,
                  userId: subscription.userId,
                  instanceId: instance.id,
                });

                await prisma.botEvent.create({
                  data: {
                    botId: bot.id,
                    type: "subscription_payment_failed",
                    payloadJson: JSON.stringify({
                      subscriptionId: subscription.id,
                      stripeEventId: event.id,
                    }),
                  },
                });
              }
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const stripeSubscription = event.data.object;
          const customerId =
            typeof stripeSubscription.customer === "string"
              ? stripeSubscription.customer
              : stripeSubscription.customer?.id;

          if (customerId) {
            const statusMap: Record<string, string> = {
              active: "active",
              past_due: "past_due",
              canceled: "canceled",
              unpaid: "past_due",
            };
            const mappedStatus = statusMap[stripeSubscription.status];
            if (mappedStatus) {
              await prisma.subscription.updateMany({
                where: { providerCustomerId: customerId },
                data: {
                  status: mappedStatus as "active" | "past_due" | "canceled",
                  currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
                },
              });
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const stripeSubscription = event.data.object;
          const customerId =
            typeof stripeSubscription.customer === "string"
              ? stripeSubscription.customer
              : stripeSubscription.customer?.id;

          if (customerId) {
            const subscription = await prisma.subscription.findFirst({
              where: { providerCustomerId: customerId },
              include: { user: { include: { bot: { include: { instance: true } } } } },
            });

            if (subscription) {
              await prisma.subscription.update({
                where: { id: subscription.id },
                data: { status: "canceled" },
              });

              const bot = subscription.user?.bot;
              const instance = bot?.instance;
              if (bot && instance) {
                await enqueueJob({
                  type: "DESTROY_BOT_SUBSCRIPTION_ENDED",
                  botId: bot.id,
                  userId: subscription.userId,
                  instanceId: instance.id,
                  volumeId: instance.providerVolumeId,
                });

                await prisma.botEvent.create({
                  data: {
                    botId: bot.id,
                    type: "subscription_ended",
                    payloadJson: JSON.stringify({
                      subscriptionId: subscription.id,
                      stripeEventId: event.id,
                    }),
                  },
                });
              }
            }
          }
          break;
        }

        default:
          break;
      }

      return { received: true };
    },
  );
}
