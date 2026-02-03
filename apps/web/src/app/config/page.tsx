"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { Textarea } from "@/components/Textarea";

const PROVIDER_OPTIONS = [
  { value: "", label: "Select provider..." },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

export default function ConfigPage() {
  const router = useRouter();
  const [modelProvider, setModelProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [systemInstructions, setSystemInstructions] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Track initial values to only send changed fields
  const [initialProvider, setInitialProvider] = useState("");
  const [initialInstructions, setInitialInstructions] = useState("");

  const dismissMessage = useCallback(() => setMessage(null), []);

  useEffect(() => {
    api.bot
      .getConfig()
      .then((data) => {
        setModelProvider(data.config.modelProvider);
        setInitialProvider(data.config.modelProvider);
        setHasExistingKey(data.config.hasApiKey);
        setSystemInstructions(data.config.systemInstructions);
        setInitialInstructions(data.config.systemInstructions);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setMessage({ type: "error", text: "Failed to load current settings" });
      })
      .finally(() => setLoadingConfig(false));
  }, []);

  useEffect(() => {
    if (message?.type === "success") {
      const timer = setTimeout(dismissMessage, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, dismissMessage]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: { modelProvider?: string; apiKey?: string; systemInstructions?: string } = {};
      if (modelProvider !== initialProvider) payload.modelProvider = modelProvider;
      if (apiKey) payload.apiKey = apiKey;
      if (systemInstructions !== initialInstructions) payload.systemInstructions = systemInstructions;

      await api.bot.config(payload);
      setMessage({ type: "success", text: "Configuration saved" });
      setInitialProvider(modelProvider);
      setInitialInstructions(systemInstructions);
      setApiKey("");
      setShowApiKey(false);
      if (apiKey) setHasExistingKey(true);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setSaving(false);
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
          Bot Settings
        </h1>

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          {/* Model Provider */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Model Provider
            </h2>
            <Select
              label="Provider"
              options={PROVIDER_OPTIONS}
              value={modelProvider}
              onChange={setModelProvider}
              disabled={saving || loadingConfig}
            />
          </Card>

          {/* API Keys */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              API Keys
            </h2>
            <div className="relative">
              <Input
                label="API Key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasExistingKey ? "Key set - enter new key to replace" : "Enter your API key"}
                disabled={saving || loadingConfig}
                helperText="Keys are encrypted at rest. Only you can update them."
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-[34px] rounded p-1 text-neutral-400 transition-colors hover:text-neutral-600"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </Card>

          {/* System Instructions */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Instructions
            </h2>
            <Textarea
              label="System Instructions"
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              rows={6}
              maxLength={10000}
              showCount
              disabled={saving || loadingConfig}
              placeholder="Provide instructions for how your bot should behave..."
            />
          </Card>

          {/* Message */}
          {message && (
            <div
              className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm animate-fade-in ${
                message.type === "success"
                  ? "bg-success-50 text-success-700"
                  : "bg-error-50 text-error-700"
              }`}
              role={message.type === "error" ? "alert" : "status"}
            >
              <div className="flex items-center gap-2">
                {message.type === "success" ? (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                )}
                {message.text}
              </div>
              {message.type === "error" && (
                <button
                  type="button"
                  onClick={dismissMessage}
                  className="ml-4 shrink-0 rounded p-1 transition-colors hover:bg-error-100"
                  aria-label="Dismiss message"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
