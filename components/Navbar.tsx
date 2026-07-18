"use client";
import { useSession, signOut } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";

export default function Navbar() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const path = usePathname();
  const isAdmin = session?.user?.role === "admin";
  const isApproved = (session?.user as any)?.isApproved;
  const isImpersonating = (session as any)?.isImpersonating;
  const realAdmin = (session as any)?.realAdmin;

  async function exitImpersonation() {
    await update({ impersonateUserId: null });
    router.push("/admin/users");
    router.refresh();
  }

  const userLinks = isApproved ? [
    { href: "/user/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/user/tradeconfig", label: "Subscriptions", icon: "🔗" },
    { href: "/user/pnl-report", label: "PnL Report", icon: "📈" },
    { href: "/marketplace", label: "Marketplace", icon: "🏪" },
    { href: "/user/payments", label: "Billing & Payment", icon: "💳" },
  ] : [
    { href: "/marketplace", label: "Marketplace", icon: "🏪" },
  ];
  const adminLinks = [
    { href: "/admin/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/admin/users", label: "Users", icon: "👥" },
    { href: "/admin/billing-report", label: "Billing", icon: "🧾" },
    { href: "/admin/bot-status", label: "Bot Status", icon: "🤖" },
    { href: "/admin/positions", label: "Positions", icon: "📍" },
    { href: "/admin/strategies", label: "Strategies", icon: "📚" },
    { href: "/admin/manual-signal", label: "Manual Entry/Exit", icon: "🚨" },
    { href: "/simulator", label: "Simulator", icon: "🚀" },
  ];
  const inAdminSection = isAdmin && !path.startsWith("/user") && !path.startsWith("/marketplace");
  const links = inAdminSection ? adminLinks : userLinks;
  const homeHref = inAdminSection ? "/admin/dashboard" : "/user/dashboard";

  const Logo = (
    <Link href={homeHref} className="flex items-center gap-2.5 select-none" onClick={() => setDrawerOpen(false)}>
      <Image src="/alm-logo.png?v=3" alt="AlgoMomentum" width={34} height={34} className="object-contain" priority />
      <div className="flex flex-col leading-tight">
        <span className="text-sm tracking-wide font-extrabold" style={{fontFamily:"var(--font-nunito)"}}><span className="text-green-500">Algo</span><span className="text-foreground">Momentum</span></span>
        <span className="text-cyan-400 text-[10px] font-normal tracking-wider uppercase">V2.0</span>
      </div>
    </Link>
  );

  const NavLinks = (
    <div className="flex flex-col gap-1 px-3">
      {links.map((l) => (
        <Link key={l.href} href={l.href} onClick={() => setDrawerOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            path === l.href
              ? "bg-foreground/10 text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
          }`}>
          <span className="text-base">{l.icon}</span>
          {l.label}
        </Link>
      ))}
    </div>
  );

  const Footer = (
    <div className="px-3 py-3 space-y-2 border-t border-border">
      {isAdmin && (
        <Link href={inAdminSection ? "/user/dashboard" : "/admin/dashboard"} onClick={() => setDrawerOpen(false)}
          className="block text-center text-xs bg-yellow-500 text-black px-3 py-2 rounded-full font-semibold hover:bg-yellow-400 transition">
          {inAdminSection ? "👤 User View" : "⚙ Admin Panel"}
        </Link>
      )}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-muted-foreground truncate">{session?.user?.email}</span>
        <ThemeToggle inline />
      </div>
      <button onClick={() => signOut({ callbackUrl: "/Signup" })}
        className="w-full text-xs bg-foreground/5 hover:bg-foreground/10 text-foreground px-3 py-2 rounded-lg transition">
        Sign Out
      </button>
    </div>
  );

  return (
    <>
      {isImpersonating && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-black text-sm font-medium px-4 py-2 flex items-center justify-center gap-3">
          <span>👤 Viewing as {session?.user?.name ?? session?.user?.email} — real login: {realAdmin?.name ?? realAdmin?.email}</span>
          <button onClick={exitImpersonation} className="underline font-semibold">Exit</button>
        </div>
      )}
      {/* Mobile top bar */}
      <div className={`lg:hidden bg-background text-foreground border-b border-border px-4 py-2.5 flex items-center justify-between shadow-lg sticky z-40 ${isImpersonating ? "top-9" : "top-0"}`}>
        {Logo}
        <button onClick={() => setDrawerOpen(true)} aria-label="Open menu"
          className="p-2 rounded-lg hover:bg-foreground/10 text-foreground transition">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80%] bg-background border-r border-border flex flex-col shadow-xl">
            <div className="px-4 py-4 flex items-center justify-between">
              {Logo}
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="p-1 text-muted-foreground hover:text-foreground">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">{NavLinks}</div>
            {Footer}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className={`app-sidebar-desktop hidden lg:flex lg:flex-col fixed inset-x-0 left-0 w-64 bg-background text-foreground border-r border-border z-30 ${isImpersonating ? "top-9 bottom-0" : "inset-y-0"}`}>
        <div className="px-4 py-5">{Logo}</div>
        <div className="flex-1 overflow-y-auto py-2">{NavLinks}</div>
        {Footer}
      </div>
    </>
  );
}
