"use client";
import { useSession, signOut } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
export default function Navbar() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const path = usePathname();
  const isAdmin = session?.user?.role === "admin";
  const isApproved = (session?.user as any)?.isApproved;
  const deltaUserId = (session?.user as any)?.deltaUserId;

  const userLinks = isApproved ? [
    { href: "/user/dashboard", label: "Dashboard" },
    { href: "/user/tradeconfig", label: "Subscriptions" },
    { href: "/user/pnl-report", label: "PnL Report" },
    { href: "/marketplace", label: "Marketplace" },
    { href: "/user/payments", label: "Billing & Payment" },
  ] : [
    { href: "/marketplace", label: "Marketplace" },
  ];
  const adminLinks = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/billing-report", label: "Billing" },
    { href: "/admin/bot-status", label: "Bot Status" },
    { href: "/admin/positions", label: "Positions" },
    { href: "/admin/strategies", label: "Strategies" },
    { href: "/simulator", label: "Simulator" },
  ];
  const links = isAdmin && !path.startsWith("/user") && !path.startsWith("/marketplace") ? adminLinks : userLinks;
  return (
    <nav className="bg-[#0D1117] text-white px-6 py-2 flex items-center justify-between shadow-lg sticky top-0 z-40">
      <div className="flex items-center gap-6">
        <Link href={isAdmin && !path.startsWith("/user") && !path.startsWith("/marketplace") ? "/admin/dashboard" : "/user/dashboard"}
          className="flex items-center gap-2.5 select-none">
          <Image src="/alm-logo.png?v=3" alt="AlgoMomentum" width={38} height={38} className="object-contain" priority />
          <div className="flex flex-col leading-tight">
            <span className="text-sm tracking-wide font-extrabold" style={{fontFamily:"var(--font-nunito)"}}><span className="text-green-500">Algo</span><span className="text-white">Momentum</span></span>
            <span className="text-cyan-400 text-[10px] font-normal tracking-wider uppercase">V2.0</span>
          </div>
        </Link>
        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                path === l.href
                  ? "bg-white/20 text-white font-medium"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              }`}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link href={path.startsWith("/user") || path.startsWith("/marketplace") ? "/admin/dashboard" : "/user/dashboard"}
            className="text-xs bg-yellow-500 text-black px-3 py-1.5 rounded-full font-semibold hover:bg-yellow-400 transition">
            {path.startsWith("/user") || path.startsWith("/marketplace") ? "⚙ Admin Panel" : "👤 User View"}
          </Link>
        )}
<ThemeToggle inline />
        <span className="text-xs text-cyan-400 hidden md:block">{session?.user?.email}</span>
        <button onClick={() => signOut({ callbackUrl: "/Signup" })}
          className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
          Sign Out
        </button>
      </div>
    </nav>
  );
}
