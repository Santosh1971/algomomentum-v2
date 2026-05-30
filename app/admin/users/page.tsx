"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isVerified: boolean;
  createdAt: string;
  phone: string;
  _count?: { tradeConfigs: number };
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    fetch("/api/v1/admin/users")
      .then((r) => r.json())
      .then((d) => { setUsers(d); setLoading(false); });
  }, []);

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1E3A5F]">All Users</h1>
            <p className="text-sm text-gray-500 mt-1">{users.length} registered clients</p>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="border rounded-xl px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1E3A5F] text-white text-xs">
                  {["Name", "Email", "Role", "Verified", "Joined", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">No users found</td></tr>
                ) : (
                  filtered.map((u, i) => (
                    <tr key={u.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-5 py-3 font-medium text-gray-800">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#1E3A5F] text-white flex items-center justify-center text-xs font-bold">
                            {(u.name ?? u.email)[0].toUpperCase()}
                          </div>
                          {u.name ?? "—"}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{u.email}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.role === "admin" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"
                        }`}>{u.role}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium ${u.isVerified ? "text-green-600" : "text-red-500"}`}>
                          {u.isVerified ? "✓ Yes" : "✗ No"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {new Date(u.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/admin/users/${u.id}`}
                          className="text-xs bg-[#1E3A5F] text-white px-3 py-1.5 rounded-lg hover:bg-[#152c4a] transition">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
