"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState({ users: 0, activeConfigs: 0 });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    fetch("/api/v1/admin/users")
      .then((r) => r.json())
      .then((users) => setStats((s) => ({ ...s, users: users.length })));
  }, []);

  const cards = [
    { title: "Total Clients", value: stats.users, icon: "👥", href: "/admin/users", color: "bg-blue-50 border-blue-200" },
    { title: "Billing Reports", value: "Generate", icon: "🧾", href: "/admin/billing-report", color: "bg-green-50 border-green-200" },
    { title: "Bot Status", value: "Live", icon: "🤖", href: "/admin/bot-status", color: "bg-purple-50 border-purple-200" },
    { title: "Manage Symbols", value: "Configure", icon: "⚙️", href: "/admin/managesymbols", color: "bg-yellow-50 border-yellow-200" },
    { title: "Marketplace", value: "Strategies", icon: "🏪", href: "/admin/strategies", color: "bg-purple-50 border-purple-200" },
    { title: "Signal Simulator", value: "Test", icon: "🚀", href: "/simulator", color: "bg-purple-50 border-purple-200" },
    { title: "All Positions", value: "Live View", icon: "📊", href: "/admin/positions", color: "bg-indigo-50 border-indigo-200" },
    { title: "Emergency Exit", value: "⚠️ Exit All", icon: "🚨", href: "/admin/EMERGENCY_EXIT", color: "bg-red-50 border-red-200" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <h1 className="text-2xl font-bold text-[#161B22]">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">AlgoMomentum Bridge v2 — Platform Overview</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}
              className={`${card.color} border rounded-2xl p-5 hover:shadow-md transition-shadow`}>
              <div className="text-3xl mb-2">{card.icon}</div>
              <p className="text-2xl font-bold text-gray-800">{card.value}</p>
              <p className="text-sm text-gray-500 mt-1">{card.title}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
