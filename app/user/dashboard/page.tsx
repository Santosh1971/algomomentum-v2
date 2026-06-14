"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  useEffect(() => { if (status === "unauthenticated") router.push("/Signup"); }, [status, router]);
  if (status === "loading") return null;
  const isAdmin = session?.user?.role === "admin";
  const showAdminCards = false; // /user/dashboard is always user view

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <h1 className="text-2xl font-bold text-[#161B22]">Welcome back, {session?.user?.name || session?.user?.email} 👋</h1>
          <p className="text-gray-500 mt-1">{isAdmin ? "Viewing as User — click Admin Panel to switch back" : "User Dashboard"}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/user/tradeconfig" className="bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition block">
            <div className="text-3xl mb-3">🔗</div>
            <h2 className="font-semibold text-gray-800">Trading Accounts</h2>
            <p className="text-sm text-gray-500 mt-1">Connect Delta accounts & manage bot configs</p>
          </Link>
          <Link href="/user/pnl-report" className="bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition block" style={{borderColor:"#e8f5e9"}}>
            <div className="text-3xl mb-3">📊</div>
            <h2 className="font-semibold text-gray-800">PnL Report</h2>
            <p className="text-sm text-gray-500 mt-1">View live PnL from Delta fills</p>
          </Link>
          <Link href="/user/payments" className="bg-white rounded-2xl p-5 shadow-sm border hover:shadow-md transition block" style={{borderColor:"#f3e5f5"}}>
            <div className="text-3xl mb-3">💳</div>
            <h2 className="font-semibold text-gray-800">Payments</h2>
            <p className="text-sm text-gray-500 mt-1">View invoices and billing history</p>
          </Link>
        </div>
        {showAdminCards && (
          <>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Admin</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/admin/users" className="bg-yellow-50 rounded-2xl p-5 border border-yellow-100 hover:shadow-md transition block">
                <div className="text-3xl mb-3">👥</div>
                <h2 className="font-semibold text-gray-800">All Users</h2>
                <p className="text-sm text-gray-500 mt-1">View and manage all client accounts</p>
              </Link>
              <Link href="/admin/billing-report" className="bg-yellow-50 rounded-2xl p-5 border border-yellow-100 hover:shadow-md transition block">
                <div className="text-3xl mb-3">🧾</div>
                <h2 className="font-semibold text-gray-800">Billing Report</h2>
                <p className="text-sm text-gray-500 mt-1">Generate invoices and billing reports</p>
              </Link>
              <Link href="/admin/bot-status" className="bg-red-50 rounded-2xl p-5 border border-red-100 hover:shadow-md transition block">
                <div className="text-3xl mb-3">🤖</div>
                <h2 className="font-semibold text-gray-800">Bot Status</h2>
                <p className="text-sm text-gray-500 mt-1">Live status of all running bots</p>
              </Link>
              <Link href="/admin/managesymbols" className="bg-blue-50 rounded-2xl p-5 border border-blue-100 hover:shadow-md transition block">
                <div className="text-3xl mb-3">⚙️</div>
                <h2 className="font-semibold text-gray-800">Manage Symbols</h2>
                <p className="text-sm text-gray-500 mt-1">Add, edit and delete trading symbols</p>
              </Link>
              <Link href="/simulator" className="bg-purple-50 rounded-2xl p-5 border border-purple-100 hover:shadow-md transition block">
                <div className="text-3xl mb-3">🚀</div>
                <h2 className="font-semibold text-gray-800">Signal Simulator</h2>
                <p className="text-sm text-gray-500 mt-1">Fire test signals to the bridge</p>
              </Link>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
