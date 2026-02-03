import type { Metadata } from "next";
import { ibmPlexSans } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Managed Bot Platform",
  description: "Your personal bot workspace",
  openGraph: {
    title: "Managed Bot Platform",
    description: "Your personal bot workspace",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlexSans.variable}>
      <body className="overflow-x-hidden">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
