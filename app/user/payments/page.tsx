"use client";
import { useEffect, useState, useRef } from "react";
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
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { if (status === "unauthenticated") router.push("/Signup"); }, [status, router]);

  useEffect(() => {
    fetch("/api/v1/user/billing")
      .then(r => r.json())
      .then(d => { setBillings(d.billings ?? []); setSettings(d.settings ?? null); setLoading(false); });
  }, []);

  async function uploadScreenshot(billingId: string, file: File) {
    setUploadingId(billingId);
    const billing = billings.find(b => b.id === billingId);
    const fd = new FormData();
    fd.append("billingId", billingId);
    fd.append("amountPaid", String(billing?.billableAmount ?? 0));
    fd.append("screenshot", file);
    const res = await fetch("/api/v1/user/billing", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      toast.success("Screenshot uploaded! Awaiting admin confirmation.");
      setBillings(prev => prev.map(b => b.id === billingId
        ? { ...b, status: "pending_confirmation", Payment: [{ id: data.payment.id, amountPaid: data.payment.amountPaid, confirmedByAdmin: false, screenshotUrl: data.payment.screenshotUrl, paymentDate: data.payment.paymentDate ?? new Date().toISOString() }] }
        : b));
    } else toast.error(data.error ?? "Upload failed");
    setUploadingId(null);
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
                  {/* Billing summary */}
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

                    {/* Last payment status */}
                    {lastPay && (
                      <div className={`rounded-lg px-3 py-2 text-sm mb-3 ${lastPay.confirmedByAdmin ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
                        {lastPay.confirmedByAdmin
                          ? `✓ Payment of $${lastPay.amountPaid.toFixed(2)} confirmed by admin on ${new Date(lastPay.paymentDate).toLocaleDateString("en-IN")}`
                          : `⏳ Screenshot submitted — waiting for admin confirmation`}
                      </div>
                    )}

                    {/* Pay section — only if unpaid */}
                    {!isPaid && !isPending && settings && (
                      <div className="border border-gray-100 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-semibold text-gray-700">Pay via UPI</p>
                        <div className="flex gap-4 items-start">
                          {settings.upiQrImageUrl ? (
                            <img src={settings.upiQrImageUrl} alt="UPI QR" className="w-28 h-28 rounded-lg border object-contain" />
                          ) : (
                            <div className="w-28 h-28 rounded-lg border bg-gray-50 flex items-center justify-center text-xs text-gray-400">QR pending</div>
                          )}
                          <div className="flex-1 space-y-2">
                            {settings.upiId && (
                              <div>
                                <p className="text-xs text-gray-400">UPI ID</p>
                                <p className="font-mono font-medium text-gray-700">{settings.upiId}</p>
                              </div>
                            )}
                            <p className="text-xs text-gray-500">
                              1. Pay <span className="font-bold text-gray-800">${b.billableAmount.toFixed(2)}</span> using the QR or UPI ID above<br />
                              2. Take a screenshot of the payment confirmation<br />
                              3. Upload the screenshot below
                              {settings.adminWhatsapp && <><br />4. Also send to WhatsApp: <span className="font-medium">{settings.adminWhatsapp}</span></>}
                            </p>
                          </div>
                        </div>
                        <div>
                          <input
                            type="file" accept="image/*"
                            ref={el => { fileRefs.current[b.id] = el; }}
                            className="hidden"
                            onChange={e => { if (e.target.files?.[0]) uploadScreenshot(b.id, e.target.files[0]); }}
                          />
                          <button
                            onClick={() => fileRefs.current[b.id]?.click()}
                            disabled={uploadingId === b.id}
                            className="w-full bg-[#1E3A5F] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#152c4a] disabled:opacity-50">
                            {uploadingId === b.id ? "Uploading..." : "Upload Payment Screenshot"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Re-upload if pending */}
                    {isPending && !isPaid && (
                      <div className="mt-2">
                        <input
                          type="file" accept="image/*"
                          ref={el => { fileRefs.current[b.id] = el; }}
                          className="hidden"
                          onChange={e => { if (e.target.files?.[0]) uploadScreenshot(b.id, e.target.files[0]); }}
                        />
                        <button onClick={() => fileRefs.current[b.id]?.click()}
                          disabled={uploadingId === b.id}
                          className="text-xs text-gray-400 hover:text-gray-600 underline">
                          Re-upload screenshot
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
