"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";

interface Payment { id: string; amountPaid: number; confirmedByAdmin: boolean; screenshotUrl: string | null; paymentDate: string; }
interface BillingRow {
  id: string; month: string; netPnl: number; billableAmount: number;
  platformFeePercent: number; status: string;
  tradeConfig: { script: string };
  Payment: Payment[];
}
interface Settings { platformFeePercent: number; upiQrImageUrl: string | null; upiId: string | null; adminWhatsapp: string | null; }

export default function UserBillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [billings, setBillings] = useState<BillingRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => { if (status === "unauthenticated") router.push("/Signup"); }, [status, router]);

  useEffect(() => {
    fetch("/api/v1/user/billing")
      .then(r => r.json())
      .then(d => { setBillings(d.billings ?? []); setSettings(d.settings ?? null); setLoading(false); });
  }, []);

  async function markAsPaid(billingId: string) {
    setMarkingId(billingId);
    const billing = billings.find(b => b.id === billingId);
    const res = await fetch("/api/v1/user/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingId, amountPaid: billing?.billableAmount ?? 0 }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success("Marked as paid! Amit will confirm shortly.");
      setBillings(prev => prev.map(b => b.id === billingId ? { ...b, status: "pending_confirmation" } : b));
    } else toast.error(data.error ?? "Failed");
    setMarkingId(null);
  }

  function statusBadge(s: string) {
    const map: Record<string, string> = {
      unpaid: "bg-red-100 text-red-700", paid: "bg-green-100 text-green-700",
      no_bill: "bg-gray-100 text-gray-500", pending_confirmation: "bg-yellow-100 text-yellow-700",
    };
    return map[s] ?? "bg-gray-100 text-gray-500";
  }

  const totalDue = billings.filter(b => b.status === "unpaid").reduce((s, b) => s + b.billableAmount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1E3A5F]">Billing & Payment</h1>
          {totalDue > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-right">
              <p className="text-xs text-red-500">Total due</p>
              <p className="text-xl font-bold text-red-600">${totalDue.toFixed(2)}</p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : billings.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-gray-600 font-medium">No charges this month</p>
            <p className="text-sm text-gray-400 mt-1">Platform fees only apply on profitable coins</p>
          </div>
        ) : (
          <div className="space-y-4">
            {billings.map(b => {
              const lastPay = b.Payment[0];
              const isPending = b.status === "pending_confirmation";
              const isPaid = b.status === "paid";
              return (
                <div key={b.id} className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-800 text-lg">{b.tradeConfig.script}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(b.status)}`}>{b.status.replace("_", " ")}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{b.month}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-gray-800">${b.billableAmount.toFixed(2)}</p>
                        <p className="text-xs text-gray-400">Net PnL ${b.netPnl.toFixed(2)} × {b.platformFeePercent}%</p>
                      </div>
                    </div>

                    {/* Payment status */}
                    {isPaid && (
                      <div className="rounded-lg px-3 py-2 text-sm bg-green-50 text-green-700 mb-3">
                        ✓ Payment confirmed by admin
                      </div>
                    )}
                    {isPending && (
                      <div className="rounded-lg px-3 py-2 text-sm bg-yellow-50 text-yellow-700 mb-3">
                        ⏳ Payment marked — waiting for Amit to confirm
                      </div>
                    )}

                    {/* Pay instructions — only if unpaid */}
                    {!isPaid && !isPending && settings && (
                      <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-semibold text-gray-700">How to pay</p>
                        <div className="flex gap-4 items-start">
                          {settings.upiQrImageUrl ? (
                            <img src={settings.upiQrImageUrl} alt="UPI QR" className="w-48 h-48 rounded-lg border object-contain" />
                          ) : (
                            <div className="w-48 h-48 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400">QR not set yet</div>
                          )}
                          <div className="flex-1 space-y-2 text-sm text-gray-600">
                            {settings.upiId && (
                              <p>UPI ID: <span className="font-mono font-medium text-gray-800">{settings.upiId}</span></p>
                            )}
                            <p>Amount: <span className="font-bold text-gray-800">${b.billableAmount.toFixed(2)}</span></p>
                            <ol className="list-decimal list-inside space-y-1 text-xs text-gray-500">
                              <li>Pay using the QR code or UPI ID above</li>
                              <li>Take a screenshot of the payment confirmation</li>
                              {settings.adminWhatsapp && <li>Send screenshot to WhatsApp: <span className="font-medium text-gray-700">{settings.adminWhatsapp}</span></li>}
                              <li>Click "I've Paid" below</li>
                            </ol>
                          </div>
                        </div>
                        <button
                          onClick={() => markAsPaid(b.id)}
                          disabled={markingId === b.id}
                          className="w-full bg-[#1E3A5F] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#152c4a] disabled:opacity-50">
                          {markingId === b.id ? "Marking..." : "✓ I've Paid — Notify Amit"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
