"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface BotData {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Language constraint: user-friendly terminology only
const STATUS_LABELS: Record<string, string> = {
  provisioning: "Setting up...",
  initializing: "Starting up...",
  running: "Active",
  stopped: "Paused",
  error: "Needs attention",
  destroying: "Removing...",
  destroyed: "Removed",
};

export default function DashboardPage() {
  const router = useRouter();
  const [bot, setBot] = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  async function loadBot() {
    try {
      const data = await api.bot.status();
      setBot(data.bot as BotData);
    } catch {
      setBot(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBot();
  }, []);

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      await api.bot.create("My Bot");
      await loadBot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bot");
    } finally {
      setCreating(false);
    }
  }

  async function handleStop() {
    setActionLoading(true);
    try {
      await api.bot.stop();
      await loadBot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause bot");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestart() {
    setActionLoading(true);
    try {
      await api.bot.restart();
      await loadBot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart bot");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLogout() {
    await api.auth.logout();
    router.push("/login");
  }

  if (loading) {
    return <div style={{ padding: 40 }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <div>
          <a href="/billing" style={{ marginRight: 16 }}>Billing</a>
          <a href="/config" style={{ marginRight: 16 }}>Settings</a>
          <button onClick={handleLogout} style={{ padding: "4px 12px" }}>Log out</button>
        </div>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {!bot || bot.status === "destroyed" ? (
        <div style={{ marginTop: 24, padding: 24, border: "1px solid #ddd", borderRadius: 8 }}>
          <h2>Create Your Bot</h2>
          <p>Set up your personal bot workspace.</p>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{ padding: "8px 24px", fontSize: 16 }}
          >
            {creating ? "Creating..." : "Create Bot"}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 24, padding: 24, border: "1px solid #ddd", borderRadius: 8 }}>
          <h2>{bot.name}</h2>
          <p>
            Status: <strong>{STATUS_LABELS[bot.status] ?? bot.status}</strong>
          </p>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            {bot.status === "running" && (
              <>
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  style={{ padding: "8px 16px" }}
                >
                  Pause
                </button>
                <a
                  href="/api/bot/panel/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "8px 16px",
                    background: "#0070f3",
                    color: "white",
                    textDecoration: "none",
                    borderRadius: 4,
                  }}
                >
                  Open Control Panel
                </a>
              </>
            )}
            {["stopped", "error"].includes(bot.status) && (
              <button
                onClick={handleRestart}
                disabled={actionLoading}
                style={{ padding: "8px 16px" }}
              >
                Restart
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
