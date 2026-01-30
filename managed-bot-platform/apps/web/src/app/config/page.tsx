"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function ConfigPage() {
  const [modelProvider, setModelProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.bot.config({
        modelProvider: modelProvider || undefined,
        apiKey: apiKey || undefined,
        systemInstructions: systemInstructions || undefined,
      });
      setMessage("Configuration saved");
      setApiKey(""); // Clear key field after save
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 24 }}>
      <h1>Bot Settings</h1>
      <a href="/dashboard" style={{ display: "inline-block", marginBottom: 16 }}>Back to Dashboard</a>

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="modelProvider" style={{ display: "block", marginBottom: 4 }}>
            Model Provider
          </label>
          <select
            id="modelProvider"
            value={modelProvider}
            onChange={(e) => setModelProvider(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          >
            <option value="">Select provider...</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="apiKey" style={{ display: "block", marginBottom: 4 }}>
            API Key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter new key to replace existing"
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
          <small style={{ color: "#666" }}>
            Keys are encrypted at rest. Only you can update them.
          </small>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="instructions" style={{ display: "block", marginBottom: 4 }}>
            System Instructions
          </label>
          <textarea
            id="instructions"
            value={systemInstructions}
            onChange={(e) => setSystemInstructions(e.target.value)}
            rows={6}
            maxLength={10000}
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </div>

        {message && (
          <p style={{ color: message.includes("saved") ? "green" : "red" }}>{message}</p>
        )}

        <button type="submit" disabled={saving} style={{ padding: "8px 24px" }}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
