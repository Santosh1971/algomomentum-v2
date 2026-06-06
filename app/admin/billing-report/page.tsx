"use client";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";

interface Payment { id: string; amountPaid: number; confirmedByAdmin: boolean; screenshotUrl: string | null; paymentDate: string; }
interface BillingRow {
  id: string; month: string; netPnl: number; billableAmount: number;
  platformFeePercent: number; status: string; generatedAt: string;
  user: { id: string; email: string; name: string | null };
  tradeConfig: { script: string };
  Payment: Payment[];
}
interface Settings { platformFeePercent: number; upiId: string | null; adminWhatsapp: string | null; upiQrImageUrl: string | null; }

export default function AdminBillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [billings, setBillings] = useState<BillingRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [feeEdit, setFeeEdit] = useState("");
  const [upiEdit, setUpiEdit] = useState("");
  const [waEdit, setWaEdit] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [genUserId, setGenUserId] = useState("");
  const [genMonth, setGenMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
    if (status === "authenticated" && session?.user?.role !== "admin") router.push("/user/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/admin/billing").then(r => r.json()),
      fetch("/api/v1/admin/settings").then(r => r.json()),
    ]).then(([b, s]) => {
      setBillings(Array.isArray(b) ? b : []);
      setSettings(s);
      setFeeEdit(String(s.platformFeePercent ?? 20));
      setUpiEdit(s.upiId ?? "");
      setWaEdit(s.adminWhatsapp ?? "");
      setLoading(false);
    });
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    const res = await fetch("/api/v1/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformFeePercent: parseFloat(feeEdit), upiId: upiEdit, adminWhatsapp: waEdit }),
    });
    const data = await res.json();
    if (res.ok) { setSettings(data); toast.success("Settings saved"); }
    else toast.error("Failed to save");
    setSavingSettings(false);
  }

  async function uploadQR(file: File) {
    const fd = new FormData();
    fd.append("qr", file);
    const res = await fetch("/api/v1/admin/settings/qr", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) { setSettings(prev => prev ? { ...prev, upiQrImageUrl: data.url } : prev); toast.success("QR updated"); }
    else toast.error("Upload failed");
  }

  async function generateNow() {
    if (!genUserId) { toast.error("Select a user"); return; }
    setGenerating(true);
    // Get all trade configs for this user
    const configsRes = await fetch(`/api/v1/tradeconfig?userId=${genUserId}`);
    const configs = await configsRes.json();
    if (!configs.length) { toast.error("No trade configs for this user"); setGenerating(false); return; }
    let success = 0, skipped = 0;
    for (const config of configs) {
      const res = await fetch("/api/v1/billing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: genUserId, tradeConfigId: config.id, monthIST: genMonth }),
      });
      const data = await res.json();
      if (res.ok) success++;
      else if (data.error?.includes("already exists")) skipped++;
      else toast.error(`${config.script}: ${data.error}`);
    }
    toast.success(`Done — ${success} generated, ${skipped} already existed`);
    setGenerating(false);
    // Reload billings
    fetch("/api/v1/admin/billing").then(r => r.json()).then(b => setBillings(Array.isArray(b) ? b : []));
  }

  async function confirmPayment(paymentId: string, billingId: string) {
    setConfirmingId(paymentId);
    const res = await fetch("/api/v1/admin/billing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, billingId }),
    });
    if (res.ok) {
      toast.success("Payment confirmed");
      setBillings(prev => prev.map(b => b.id === billingId
        ? { ...b, status: "paid", Payment: b.Payment.map(p => p.id === paymentId ? { ...p, confirmedByAdmin: true } : p) }
        : b));
    } else toast.error("Failed to confirm");
    setConfirmingId(null);
  }

  function statusBadge(s: string) {
    const map: Record<string, string> = {
      unpaid: "bg-red-100 text-red-700", paid: "bg-green-100 text-green-700",
      no_bill: "bg-gray-100 text-gray-500", pending_confirmation: "bg-yellow-100 text-yellow-700",
    };
    return map[s] ?? "bg-gray-100 text-gray-500";
  }

  // Group by month
  const months = [...new Set(billings.map(b => b.month))].sort((a, b) => b.localeCompare(a));

  const pnlColor = (v: number) => v >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">Billing — Admin</h1>

        {/* Settings */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Platform Settings</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Platform fee %</label>
              <input type="number" value={feeEdit} onChange={e => setFeeEdit(e.target.value)} min="0" max="100"
                className="border rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">UPI ID</label>
              <input value={upiEdit} onChange={e => setUpiEdit(e.target.value)} placeholder="amit@upi"
                className="border rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">WhatsApp number</label>
              <input value={waEdit} onChange={e => setWaEdit(e.target.value)} placeholder="+91XXXXXXXXXX"
                className="border rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">UPI QR image</label>
              <div className="flex items-center gap-2">
                {settings?.upiQrImageUrl && (
                  <img src={settings.upiQrImageUrl} alt="QR" className="w-10 h-10 rounded border object-contain" />
                )}
                <button onClick={() => qrInputRef.current?.click()}
                  className="text-xs px-3 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">
                  {settings?.upiQrImageUrl ? "Replace QR" : "Upload QR"}
                </button>
                <input ref={qrInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) uploadQR(e.target.files[0]); }} />
              </div>
            </div>
            <button onClick={saveSettings} disabled={savingSettings}
              className="bg-[#1E3A5F] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#152c4a] disabled:opacity-50">
              {savingSettings ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {/* Manual bill generation */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Generate Bill Now <span className="text-xs font-normal text-gray-400 ml-1">(for testing or manual run)</span></h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">User</label>
              <select value={genUserId} onChange={e => setGenUserId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                <option value="">Select user...</option>
                {billings.filter((b, i, arr) => arr.findIndex(x => x.user.id === b.user.id) === i).map(b => (
                  <option key={b.user.id} value={b.user.id}>{b.user.name ?? b.user.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Month</label>
              <input type="month" value={genMonth} onChange={e => setGenMonth(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <button onClick={generateNow} disabled={generating}
              className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {generating ? "Generating..." : "⚡ Generate Now"}
            </button>
            <p className="text-xs text-gray-400 self-center">Generates bills for all active coins of the selected user for the selected month.</p>
          </div>
        </div>

        {/* Month-wise billing tables */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : months.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border">
            <p className="text-3xl mb-3">🧾</p>
            <p className="text-gray-600 font-medium">No billing records yet</p>
            <p className="text-sm text-gray-400 mt-1">Bills are auto-generated on 1st of each month at 00:01</p>
          </div>
        ) : (
          months.map(month => {
            const rows = billings.filter(b => b.month === month);
            const totalNet = rows.reduce((s, b) => s + b.netPnl, 0);
            const totalFee = rows.reduce((s, b) => s + b.billableAmount, 0);
            return (
              <div key={month} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <div className="px-5 py-3 bg-[#1E3A5F] flex items-center justify-between">
                  <span className="text-white font-semibold">{month}</span>
                  <div className="flex gap-6 text-sm">
                    <span className="text-blue-200">Net PnL: <span className={`font-bold ${totalNet >= 0 ? "text-green-300" : "text-red-300"}`}>${totalNet.toFixed(2)}</span></span>
                    <span className="text-blue-200">Platform fees: <span className="font-bold text-white">${totalFee.toFixed(2)}</span></span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b bg-gray-50">
                      <th className="text-left px-4 py-2">User</th>
                      <th className="text-left px-4 py-2">Coin</th>
                      <th className="text-right px-4 py-2">Gross PnL</th>
                      <th className="text-right px-4 py-2">Delta fees</th>
                      <th className="text-right px-4 py-2">Net PnL</th>
                      <th className="text-right px-4 py-2">Fee %</th>
                      <th className="text-right px-4 py-2">Platform ₹</th>
                      <th className="text-center px-4 py-2">Status</th>
                      <th className="text-center px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((b, i) => {
                      const lastPay = b.Payment[0];
                      return (
                        <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="px-4 py-2.5 text-gray-700">{b.user.name ?? b.user.email}</td>
                          <td className="px-4 py-2.5 font-bold text-gray-800">{b.tradeConfig.script}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${pnlColor(b.netPnl)}`}>${b.netPnl.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-orange-500">—</td>
                          <td className={`px-4 py-2.5 text-right font-bold ${pnlColor(b.netPnl)}`}>${b.netPnl.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{b.platformFeePercent}%</td>
                          <td className="px-4 py-2.5 text-right font-bold text-gray-800">${b.billableAmount.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(b.status)}`}>{b.status}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {lastPay && !lastPay.confirmedByAdmin && (
                              <div className="flex items-center justify-center gap-2">
                                {lastPay.screenshotUrl && (
                                  <a href={lastPay.screenshotUrl} target="_blank" rel="noreferrer"
                                    className="text-xs text-blue-500 hover:underline">Screenshot</a>
                                )}
                                <button onClick={() => confirmPayment(lastPay.id, b.id)}
                                  disabled={confirmingId === lastPay.id}
                                  className="text-xs px-3 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium">
                                  {confirmingId === lastPay.id ? "..." : "Confirm"}
                                </button>
                              </div>
                            )}
                            {lastPay?.confirmedByAdmin && (
                              <span className="text-xs text-green-600 font-medium">✓ Confirmed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
