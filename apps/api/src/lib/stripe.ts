import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey && process.env.NODE_ENV === "production") {
  throw new Error("STRIPE_SECRET_KEY environment variable is required in production");
}

export const stripe = new Stripe(secretKey ?? "", {
  apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion,
});

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";

if (process.env.NODE_ENV !== "test") {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is required");
  }
  if (!STRIPE_PRICE_ID) {
    throw new Error("STRIPE_PRICE_ID environment variable is required");
  }
}
