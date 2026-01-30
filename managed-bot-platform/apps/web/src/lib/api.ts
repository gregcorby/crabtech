const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(body.message ?? `API error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    signup: (email: string, password: string) =>
      apiFetch("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    login: (email: string, password: string) =>
      apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    logout: () => apiFetch("/auth/logout", { method: "POST" }),
    me: () => apiFetch<{ user: { id: string; email: string; createdAt: string } }>("/auth/me"),
  },
  bot: {
    create: (name: string) =>
      apiFetch("/bot/create", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    status: () =>
      apiFetch<{
        bot: { id: string; name: string; status: string; createdAt: string; updatedAt: string };
        secrets: Array<{ key: string; present: boolean }>;
      }>("/bot/status"),
    stop: () => apiFetch("/bot/stop", { method: "POST" }),
    restart: () => apiFetch("/bot/restart", { method: "POST" }),
    config: (data: { modelProvider?: string; apiKey?: string; systemInstructions?: string }) =>
      apiFetch("/bot/config", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    events: () =>
      apiFetch<{
        events: Array<{ id: string; type: string; payloadJson: string | null; createdAt: string }>;
      }>("/bot/events"),
  },
  billing: {
    status: () =>
      apiFetch<{ subscription: { status: string; currentPeriodEnd: string | null } }>(
        "/billing/status",
      ),
    checkout: () => apiFetch<{ checkoutUrl: string }>("/billing/checkout", { method: "POST" }),
  },
};
