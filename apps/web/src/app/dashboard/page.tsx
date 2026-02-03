"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/cn";

interface BotData {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  provisioning: "Setting up...",
  initializing: "Starting up...",
  running: "Active",
  stopped: "Paused",
  error: "Needs attention",
  destroying: "Removing...",
  destroyed: "Removed",
};

function SkeletonCard() {
  return (
    <Card>
      <div className="space-y-4">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-4 w-24" />
        <div className="flex gap-3 pt-2">
          <div className="skeleton h-10 w-24" />
          <div className="skeleton h-10 w-36" />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [bot, setBot] = useState<BotData | null>(null);
  const [noBotConfirmed, setNoBotConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function loadBot() {
    try {
      setError("");
      const data = await api.bot.status();
      setBot(data.bot as BotData);
      setNoBotConfirmed(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/login");
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setBot(null);
        setNoBotConfirmed(true);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load bot status");
      }
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

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Navigation Header */}
      <header className="sticky top-0 z-dropdown border-b border-neutral-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-lg font-bold tracking-tight text-neutral-900">
            Dashboard
          </h1>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
            <a
              href="/billing"
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              Billing
            </a>
            <a
              href="/config"
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              Settings
            </a>
            <div className="ml-2 h-5 w-px bg-neutral-200" aria-hidden="true" />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-1">
              Log out
            </Button>
          </nav>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-100 sm:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <nav className="border-t border-neutral-200 bg-white px-4 py-3 sm:hidden animate-fade-in" aria-label="Mobile navigation">
            <div className="flex flex-col gap-1">
              <a
                href="/billing"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                Billing
              </a>
              <a
                href="/config"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                Settings
              </a>
              <button
                onClick={handleLogout}
                className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                Log out
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Main content */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 flex items-center justify-between rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700 animate-fade-in" role="alert">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <button
                onClick={() => {
                  setError("");
                  loadBot();
                }}
                className="rounded px-2 py-1 text-xs font-medium text-error-700 transition-colors hover:bg-error-100"
              >
                Retry
              </button>
              <button
                onClick={() => setError("")}
                className="rounded p-1 text-error-600 transition-colors hover:bg-error-100"
                aria-label="Dismiss error"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonCard />
        ) : error && !bot ? (
          /* Error state — don't show create-bot when fetch failed */
          <Card className="text-center">
            <div className="mx-auto max-w-sm py-6">
              <p className="text-sm text-neutral-600">{error}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setLoading(true);
                  loadBot();
                }}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          </Card>
        ) : !bot || (noBotConfirmed && bot.status === "destroyed") ? (
          /* Empty state */
          <Card className="text-center">
            <div className="mx-auto max-w-sm py-6">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50">
                <svg className="h-8 w-8 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-bold text-neutral-900">
                Create your bot
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Set up your personal bot workspace to get started.
              </p>
              <Button
                onClick={handleCreate}
                loading={creating}
                className="mt-6"
              >
                {creating ? "Creating..." : "Create bot"}
              </Button>
            </div>
          </Card>
        ) : (
          /* Bot status card */
          <Card className="animate-fade-in">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-xl font-bold text-neutral-900">
                    {bot.name}
                  </h2>
                  <StatusBadge
                    status={bot.status}
                    label={STATUS_LABELS[bot.status] ?? bot.status}
                  />
                </div>
                <p className="text-sm text-neutral-500">
                  Last updated {new Date(bot.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {bot.status === "running" && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleStop}
                      loading={actionLoading}
                    >
                      Pause
                    </Button>
                    <a
                      href="/api/bot/panel/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex h-9 items-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-medium text-white",
                        "transition-all duration-200 hover:bg-primary-600 active:scale-[0.98]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                      )}
                    >
                      Open Control Panel
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  </>
                )}
                {["stopped", "error"].includes(bot.status) && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleRestart}
                    loading={actionLoading}
                  >
                    Restart
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
