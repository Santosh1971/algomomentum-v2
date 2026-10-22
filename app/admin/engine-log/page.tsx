"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export default function EngineLogPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session.user.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  function load() {
    fetch("/api/v1/admin/engine-log").then((r) => r.json()).then((d) => (d.rows ? setRows(d.rows) : setErr(d.error ?? "failed"))).catch((e) => setErr(String(e)));
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#161B22]">Engine runner log</h1>
            <p className="text-sm text-gray-500 mt-1">Shadow mode: nothing here was sent to Delta. Times are IST, one row per 30-minute bar close. In shadow mode the trade is never placed, so an engine position next to a flat exchange is expected.</p>
          </div>
          <button onClick={load} className="border rounded-lg px-3 py-1.5 text-sm">Refresh</button>
        </div>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        {rows[0]?.replay?.recent?.length > 0 && (
          <div className="bg-white rounded-xl border overflow-x-auto">
            <div className="p-3 border-b text-sm font-semibold text-[#161B22]">
              What the engine would have traded (latest run)
              {rows[0].replay.open && rows[0].replay.openPnlPct != null && (
                <span className="ml-3 font-normal text-gray-500">open {rows[0].replay.open.side}: {Number(rows[0].replay.openPnlPct).toFixed(2)}% so far</span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 border-b">
                <tr><th className="p-2">Side</th><th className="p-2">Entered (IST)</th><th className="p-2">Price</th><th className="p-2">Exited (IST)</th><th className="p-2">Price</th><th className="p-2">Net %</th><th className="p-2">How</th></tr>
              </thead>
              <tbody>
                {[...rows[0].replay.recent].reverse().map((t: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{t.side}</td>
                    <td className="p-2 whitespace-nowrap">{ist(new Date((t.entryTime + 1800) * 1000).toISOString())}</td>
                    <td className="p-2">{Number(t.entryPrice).toFixed(4)}</td>
                    <td className="p-2 whitespace-nowrap">{ist(new Date((t.exitTime + 1800) * 1000).toISOString())}</td>
                    <td className="p-2">{Number(t.exitPrice).toFixed(4)}</td>
                    <td className={"p-2 " + (t.netPnlPct >= 0 ? "text-green-700" : "text-red-600")}>{Number(t.netPnlPct).toFixed(2)}</td>
                    <td className="p-2 text-gray-500">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b">
              <tr><th className="p-2">Bar</th><th className="p-2">OK</th><th className="p-2">Engine</th><th className="p-2">Exchange</th><th className="p-2">Would do</th><th className="p-2">Notes</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = r.replay?.open;
                const pos = r.exchange?.position;
                const acts: any[] = r.actions ?? [];
                return (
                  <tr key={r.id} className={"border-b align-top " + (r.ok ? "" : "bg-red-50")}>
                    <td className="p-2 whitespace-nowrap">{ist(r.barTime)}</td>
                    <td className="p-2">{r.ok ? "✓" : "✗"}</td>
                    <td className="p-2 whitespace-nowrap">{open ? `${open.side} @ ${open.entryPrice} · stop ${Number(open.stopPrice).toFixed(4)}` : r.replay ? "flat" : "—"}</td>
                    <td className="p-2 whitespace-nowrap">{pos ? `${pos.side} ${pos.size} @ ${pos.entryPrice}` : r.exchange ? "flat" : "—"}</td>
                    <td className="p-2">{acts.length ? acts.map((a, i) => <div key={i}>{a.type === "ALERT" ? "⚠ " + a.message : a.type + (a.side ? " " + a.side : "") + (a.stopPrice ? " stop " + Number(a.stopPrice).toFixed(4) : a.price ? " @ " + Number(a.price).toFixed(4) : "") + (a.previewLots !== undefined ? ` (${a.previewLots} lots)` : "")}</div>) : <span className="text-gray-400">nothing</span>}</td>
                    <td className="p-2 text-gray-500">{r.notes}</td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td className="p-4 text-gray-400" colSpan={6}>No rows yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
