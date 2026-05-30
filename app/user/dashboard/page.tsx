"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function UserDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = session?.user?.role === "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h1 className="text-2xl font-bold text-[#1E3A5F]">
            Welcome back, {session?.user?.name ?? session?.user?.email} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {isAdmin ? "You are logged in as Administrator" : "Your trading dashboard"}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: "Trading Accounts", desc: "Connect Delta accounts & manage bot configs", href: "/user/tradeconfig", icon: "🔗", color: "bg-blue-50 border-blue-200" },
            { title: "PnL Report", desc: "View live PnL from Delta fills", href: "/user/pnl-report", icon: "📊", color: "bg-green-50 border-green-200" },
            { title: "Payments", desc: "View invoices and billing history", href: "/user/payments", icon: "💳", color: "bg-purple-50 border-purple-200" },
          ].map((card) => (
            <Link key={card.href} href={card.href}
              className={`${card.color} border rounded-2xl p-5 hover:shadow-md transition-shadow`}>
              <div className="text-3xl mb-2">{card.icon}</div>
              <h3 className="font-semibold text-gray-800">{card.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
            </Link>
          ))}
        </div>

        {isAdmin && (
          <>
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Admin</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "All Users", desc: "View and manage all client accounts", href: "/admin/users", icon: "👥", color: "bg-yellow-50 border-yellow-200" },
                { title: "Billing Report", desc: "Generate invoices and billing reports", href: "/admin/billing-report", icon: "🧾", color: "bg-orange-50 border-orange-200" },
                { title: "Bot Status", desc: "Live status of all running bots", href: "/admin/bot-status", icon: "🤖", color: "bg-red-50 border-red-200" },
              ].map((card) => (
                <Link key={card.href} href={card.href}
                  className={`${card.color} border rounded-2xl p-5 hover:shadow-md transition-shadow`}>
                  <div className="text-3xl mb-2">{card.icon}</div>
                  <h3 className="font-semibold text-gray-800">{card.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
