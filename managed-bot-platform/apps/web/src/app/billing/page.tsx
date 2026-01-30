"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function BillingPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.billing
      .status()
      .then((data) => {
        setStatus(data.subscription.status);
        setPeriodEnd(data.subscription.currentPeriodEnd);
      })
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleCheckout() {
    try {
      const data = await api.billing.checkout();
      window.location.href = data.checkoutUrl;
    } catch {
      alert("Failed to start checkout");
    }
  }

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 24 }}>
      <h1>Billing</h1>
      <a href="/dashboard" style={{ display: "inline-block", marginBottom: 16 }}>Back to Dashboard</a>

      <div style={{ padding: 24, border: "1px solid #ddd", borderRadius: 8 }}>
        <p>
          Subscription: <strong>{status ?? "None"}</strong>
        </p>
        {periodEnd && (
          <p>Current period ends: {new Date(periodEnd).toLocaleDateString()}</p>
        )}
        {status !== "active" && (
          <button onClick={handleCheckout} style={{ padding: "8px 24px", marginTop: 12 }}>
            Subscribe
          </button>
        )}
      </div>
    </div>
  );
}
