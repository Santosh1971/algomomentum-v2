// app/layout.tsx
import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
const nunito = Nunito({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--font-nunito" });
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import ThemeToggle from "@/components/ThemeToggle";

import { startBillingCron } from "@/lib/billingCron";
if (typeof window === "undefined") { startBillingCron(); }

import { startDashboardStatsCron } from "@/lib/dashboardStatsCron";
if (typeof window === "undefined") { startDashboardStatsCron(); }

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AlgoMomentum — Bridge Platform v2",
  description: "Automated trading platform for Delta Exchange India",
};

export const viewport = { colorScheme: "light dark", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${nunito.variable}`}>
        <Providers>
          <ThemeToggle />
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
