import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | Managed Bot Platform",
  description: "Sign in or create an account to manage your bot workspace.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-neutral-50 via-white to-primary-50/30 px-4">
      {children}
    </div>
  );
}
