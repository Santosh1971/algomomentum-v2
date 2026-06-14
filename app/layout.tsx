// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";

import { startBillingCron } from "@/lib/billingCron";
if (typeof window === "undefined") { startBillingCron(); }

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AlgoMomentum — Bridge Platform v2",
  description: "Automated trading platform for Delta Exchange India",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
