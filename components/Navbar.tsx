"use client";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { data: session } = useSession();
  const path = usePathname();
  const isAdmin = session?.user?.role === "admin";

  const userLinks = [
    { href: "/user/dashboard", label: "Dashboard" },
    { href: "/user/tradeconfig", label: "Accounts" },
    { href: "/user/pnl-report", label: "PnL Report" },
    { href: "/user/payments", label: "Billing & Payment" },
  ];

  const adminLinks = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/billing-report", label: "Billing" },
    { href: "/admin/bot-status", label: "Bot Status" },
  ];

  const links = isAdmin && !path.startsWith("/user") ? adminLinks : userLinks;

  return (
    <nav className="bg-[#1E3A5F] text-white px-6 py-3 flex items-center justify-between shadow-lg sticky top-0 z-40">
      <div className="flex items-center gap-6">
        <Link href={isAdmin && !path.startsWith("/user") ? "/admin/dashboard" : "/user/dashboard"} className="font-bold text-lg">
          AlgoMomentum <span className="text-blue-300 text-sm font-normal">v2</span>
        </Link>
        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                path === l.href
                  ? "bg-white/20 text-white font-medium"
                  : "text-blue-200 hover:text-white hover:bg-white/10"
              }`}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link href={path.startsWith("/user") ? "/admin/dashboard" : "/user/dashboard"}
            className="text-xs bg-yellow-500 text-black px-3 py-1.5 rounded-full font-semibold hover:bg-yellow-400 transition">
            {path.startsWith("/user") ? "⚙ Admin Panel" : "👤 User View"}
          </Link>
        )}
        <span className="text-xs text-blue-300 hidden md:block">{session?.user?.email}</span>
        <button onClick={() => signOut({ callbackUrl: "/Signup" })}
          className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
          Sign Out
        </button>
      </div>
    </nav>
  );
}
