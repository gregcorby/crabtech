"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Card } from "@/components/Card";
import { cn } from "@/lib/cn";

function getPasswordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: "Weak" };
  if (score <= 2) return { score: 2, label: "Fair" };
  if (score <= 3) return { score: 3, label: "Good" };
  return { score: 4, label: "Strong" };
}

const strengthColors: Record<number, string> = {
  1: "bg-error-500",
  2: "bg-warning-500",
  3: "bg-primary-500",
  4: "bg-success-500",
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordMismatch) return;
    setError("");
    setLoading(true);
    try {
      await api.auth.signup(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
      <div className="w-full max-w-[400px] animate-fade-in">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-900">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Get started with your bot workspace
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              disabled={loading}
            />

            <div className="space-y-2">
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                disabled={loading}
              />
              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors duration-300",
                          level <= strength.score ? strengthColors[strength.score] : "bg-neutral-200",
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500">{strength.label}</p>
                </div>
              )}
            </div>

            <Input
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Re-enter your password"
              disabled={loading}
              error={passwordMismatch ? "Passwords do not match" : undefined}
            />

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

            <Button type="submit" loading={loading} disabled={passwordMismatch} className="w-full">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <a
            href="/login"
            className="font-medium text-primary-600 underline-offset-4 transition-colors hover:text-primary-700 hover:underline"
          >
            Sign in
          </a>
        </p>
      </div>
  );
}
