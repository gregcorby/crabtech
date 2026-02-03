"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";

const subscriptionStatusMap: Record<string, { status: string; label: string }> = {
  active: { status: "running", label: "Active" },
  past_due: { status: "error", label: "Past due" },
  canceled: { status: "stopped", label: "Canceled" },
  trialing: { status: "provisioning", label: "Trial" },
};

export default function BillingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.billing
      .status()
      .then((data) => {
        setStatus(data.subscription.status);
        setPeriodEnd(data.subscription.currentPeriodEnd);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setStatus(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCheckout() {
    setCheckoutLoading(true);
    setError("");
    try {
      const data = await api.billing.checkout();
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Failed to start checkout. Please try again.");
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6 lg:px-8">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Dashboard
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">
          Billing
        </h1>

        {loading ? (
          <Card className="mt-6">
            <div className="space-y-4">
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-10 w-28" />
            </div>
          </Card>
        ) : (
          <Card className="mt-6 animate-fade-in">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-600">Subscription</span>
                {status ? (
                  <StatusBadge
                    status={subscriptionStatusMap[status]?.status ?? "error"}
                    label={subscriptionStatusMap[status]?.label ?? status}
                  />
                ) : (
                  <span className="text-sm text-neutral-500">None</span>
                )}
              </div>

              {periodEnd && (
                <p className="text-sm text-neutral-500">
                  Current period ends{" "}
                  <span className="font-medium text-neutral-700">
                    {new Date(periodEnd).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </p>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-error-50 px-3 py-2.5 text-sm text-error-700" role="alert">
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {error}
                </div>
              )}

              {status !== "active" && (
                <Button onClick={handleCheckout} loading={checkoutLoading}>
                  {checkoutLoading ? "Redirecting..." : "Subscribe"}
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
