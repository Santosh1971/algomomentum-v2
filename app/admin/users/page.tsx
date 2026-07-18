"use client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Link from "next/link";

// Builds a wa.me link from a stored phone number. Strips everything but digits,
// and prepends the India country code (91) for bare 10-digit local numbers,
// since that's this platform's user base — a number already carrying a country
// code (11+ digits) is left as-is.
function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}`;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isVerified: boolean;
  isApproved: boolean;
  createdAt: string;
  phone: string;
  details?: {
    age: number; gender: string; city: string;
    district: string; country: string;
    deltaUserId: string | null; deltaAccountName: string | null;
  } | null;
}

export default function AdminUsersPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  function loadUsers() {
    fetch("/api/v1/admin/users")
      .then(r => r.json())
      .then(d => { setUsers(d); setLoading(false); });
  }

  useEffect(() => { loadUsers(); }, []);

  async function impersonate(userId: string, name: string) {
    if (!window.confirm(`View and act as ${name}? You'll see and be able to change everything exactly as they would, until you click Exit.`)) return;
    await update({ impersonateUserId: userId });
    router.push("/user/dashboard");
  }

  async function approveUser(userId: string, approve: boolean) {
    if (!window.confirm(approve ? "Approve this user's access?" : "Revoke this user's access?")) return;
    setApprovingId(userId);
    const res = await fetch("/api/v1/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isApproved: approve }),
    });
    if (res.ok) { toast.success(approve ? "User approved!" : "Access revoked"); loadUsers(); }
    else toast.error("Failed to update user");
  }

  async function deleteUser(userId: string, name: string) {
    if (!confirm(`Delete user ${name}? This cannot be undone.`)) return;
    const res = await fetch("/api/v1/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) { toast.success("User deleted"); loadUsers(); }
    else toast.error("Failed to delete user");
  }

  // Custom sort order
  const sortOrder = [
    "cruoso4@gmail.com",        // Amit Mandal (Admin)
    "jha.santosh.kr@gmail.com", // Santosh (Admin)
    "ajha1371@gmail.com",       // Anupama Jha
    "pratyakcha.jha@gmail.com", // Pratyakcha Jha
    "utkarsh.jha1971@gmail.com",// Utkarsh Jha
    "utkarsh.tenkaichi.dbz@gmail.com", // Utkarsh2
    "ayushrudra28@gmail.com",   // Ayush Rudra
    "dvndrmandal@gmail.com",    // Devendra Mandal
    "111sajal.mandal@gmail.com",// Sajal Mandal
    "sunilgupta0291@gmail.com", // Sunil Gupta
    "gamecok772019@gmail.com",  // Rahul
    "moonforweb@gmail.com",     // Ghongde Erwant Rao
    "keshavbhat247@gmail.com",  // Keshav Bhat K
  ];

  const filtered = users
    .filter(u =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const ai = sortOrder.indexOf(a.email);
      const bi = sortOrder.indexOf(b.email);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return (a.name ?? a.email).localeCompare(b.name ?? b.email);
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">All Users</h1>
            <p className="text-sm text-gray-500 mt-1">{users.length} registered clients</p>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="border rounded-xl px-4 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#161B22]" style={{backgroundColor:"white",color:"black",colorScheme:"light"}} />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#161B22] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
          {/* NEW ACCOUNTS — pending approval */}
          {filtered.filter(u => !u.isApproved).length > 0 && (
            <div className="rounded-2xl border-2 border-yellow-400 overflow-x-auto mb-2">
              <div className="bg-yellow-400/20 px-4 py-2 flex items-center gap-2">
                <span className="text-yellow-600 font-bold text-sm">🆕 New Accounts</span>
                <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">{filtered.filter(u => !u.isApproved).length} pending</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted text-foreground text-xs border-b border-border">
                    {["#", "Name", "Email", "Phone", "Age", "Gender", "City", "Delta ID", "Country", "Status", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.filter(u => !u.isApproved).map((u, i) => (
                    <tr key={u.id} className="bg-yellow-500/10 border-l-4 border-yellow-400">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px]">
                        <button onClick={() => impersonate(u.id, u.name ?? u.email ?? "this user")} className="flex items-center gap-2 hover:underline text-left">
                          <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {(u.name ?? u.email ?? "?")[0].toUpperCase()}
                          </div>
                          <span className="truncate">{u.name ?? "—"}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.email}</td>
                      <td className="px-4 py-3 text-green-600 whitespace-nowrap">
                        {u.phone ? <a href={waLink(u.phone)} target="_blank" rel="noopener noreferrer" className="hover:underline">{u.phone}</a> : "—"}
                      </td>
                      <td className="px-4 py-3">{u.details?.age ?? "—"}</td>
                      <td className="px-4 py-3">{u.details?.gender ?? "—"}</td>
                      <td className="px-4 py-3">{u.details?.city ?? "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono">{u.details?.deltaUserId || "—"}</td>
                      <td className="px-4 py-3">{u.details?.country ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${u.role === "admin" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>{u.role}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium w-fit bg-red-100 text-red-600">⏳ Pending</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap min-w-[160px]">
                        <div className="flex items-center gap-1">
                          <Link href={`/admin/users/${u.id}`} className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 transition">Bots</Link>
                          <button onClick={() => approveUser(u.id, true)} disabled={!u.details?.deltaUserId || approvingId === u.id}
                            title={!u.details?.deltaUserId ? "User must connect Delta account first" : "Approve user"}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                            {approvingId === u.id ? '⏳' : 'Approve'}
                          </button>
                          <button onClick={() => deleteUser(u.id, u.name ?? u.email)} className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 transition">Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* ALL USERS TABLE */}
          <div className="bg-card rounded-2xl shadow-sm border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted text-foreground text-xs border-b border-border">
                  {["#", "Name", "Email", "Phone", "Age", "Gender", "City", "Delta ID", "Country", "Status", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="px-5 py-10 text-center text-gray-400">No users found</td></tr>
                ) : filtered.map((u, i) => (
                  <tr key={u.id} className={!u.isApproved ? "bg-yellow-500/20 border-l-4 border-yellow-400" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px]">
                      <button onClick={() => impersonate(u.id, u.name ?? u.email)} className="flex items-center gap-2 hover:underline text-left">
                        <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {(u.name ?? u.email)[0].toUpperCase()}
                        </div>
                        {u.name ?? "—"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-green-600 whitespace-nowrap">
                      {u.phone ? <a href={waLink(u.phone)} target="_blank" rel="noopener noreferrer" className="hover:underline">{u.phone}</a> : "—"}
                    </td>
                    <td className="px-4 py-3">{u.details?.age || "—"}</td>
                    <td className="px-4 py-3">{u.details?.gender || "—"}</td>
                    <td className="px-4 py-3 max-w-[120px]">{u.details?.city || "—"}</td>
                    <td className="px-4 py-3 text-xs font-mono">{u.details?.deltaUserId || "—"}</td>
                    <td className="px-4 py-3">{u.details?.country || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${u.role === "admin" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"}`}>
                          {u.role}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${u.isApproved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {u.isApproved ? "✓ Active" : "⏳ Pending"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap min-w-[160px]">
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/users/${u.id}`}
                          className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 transition">
                          Bots
                        </Link>
                        {!u.isApproved ? (
                          <button onClick={() => approveUser(u.id, true)}
                            disabled={!u.details?.deltaUserId || approvingId === u.id}
                            title={!u.details?.deltaUserId ? "User must connect Delta account first" : "Approve user"}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                            {approvingId === u.id ? '⏳ Approving...' : 'Approve'}
                          </button>
                        ) : (
                          <button onClick={() => approveUser(u.id, false)}
                            className="text-xs bg-yellow-500 text-white px-2 py-1 rounded-lg hover:bg-yellow-600 transition">
                            Revoke
                          </button>
                        )}
                        <button onClick={() => deleteUser(u.id, u.name ?? u.email)}
                          className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 transition whitespace-nowrap">
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
