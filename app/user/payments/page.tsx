"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { toast } from "sonner";

interface Billing {
  id: string;
  month: string;
  netPnl: number;
  carryForward: number;
  billableAmount: number;
  platformFeePercent: number;
  status: string;
  generatedAt: string;
  tradeConfig: { script: string; account: { delta_account_name: string | null } | null };
  Payment: { id: string; amountPaid: number; method: string; paymentDate: string }[];
}

export default function PaymentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [billings, setBillings] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/Signup");
  }, [status, router]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`/api/v1/user/${session.user.id}/billings`)
      .then((r) => r.json())
      .then((d) => { setBillings(Array.isArray(d) ? d : []); setLoading(false); });
  }, [session]);

  function statusBadge(s: string) {
    const map: Record<string, string> = {
      unpaid: "bg-red-100 text-red-700",
      paid: "bg-green-100 text-green-700",
      waived: "bg-gray-100 text-gray-500",
      no_bill: "bg-blue-100 text-blue-600",
    };
    return map[s] ?? "bg-gray-100 text-gray-500";
  }

  const totalUnpaid = billings
    .filter((b) => b.status === "unpaid")
    .reduce((s, b) => s + b.billableAmount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1E3A5F]">Payments & Invoices</h1>
            <p className="text-sm text-gray-500 mt-1">Your billing history and pending invoices</p>
          </div>
          {totalUnpaid > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-right">
              <p className="text-xs text-red-500">Total Outstanding</p>
              <p className="text-xl font-bold text-red-600">${totalUnpaid.toFixed(2)}</p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#1E3A5F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : billings.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border">
            <p className="text-4xl mb-3">🧾</p>
            <p className="text-gray-600 font-medium">No invoices yet</p>
            <p className="text-sm text-gray-400 mt-1">Invoices are generated on the 1st of each month</p>
          </div>
        ) : (
          <div className="space-y-3">
            {billings.map((b) => (
              <div key={b.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-800">{b.month}</span>
                      <span className="font-medium text-gray-600">— {b.tradeConfig.script}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadge(b.status)}`}>
                        {b.status}
                      </span>
                    </div>
                    {b.tradeConfig.account?.delta_account_name && (
                      <p className="text-xs text-gray-400">{b.tradeConfig.account?.delta_account_name}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-sm text-gray-600">
                      <span>Net PnL: <span className={b.netPnl >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>${b.netPnl.toFixed(2)}</span></span>
                      {b.carryForward !== 0 && <span>Carry Forward: <span className="font-medium">${b.carryForward.toFixed(2)}</span></span>}
                      <span>Fee: {b.platformFeePercent}%</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-800">${b.billableAmount.toFixed(2)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(b.generatedAt).toLocaleDateString("en-IN")}
                    </p>
                    {b.status === "unpaid" && b.billableAmount > 0 && (
                      <button
                        onClick={() => toast.info("Razorpay integration coming soon!")}
                        className="mt-2 bg-[#1E3A5F] text-white text-xs px-4 py-1.5 rounded-lg hover:bg-[#152c4a] transition">
                        Pay Now
                      </button>
                    )}
                  </div>
                </div>
                {b.Payment.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {b.Payment.map((p) => (
                      <p key={p.id} className="text-xs text-gray-500">
                        ✓ Paid ${p.amountPaid.toFixed(2)} via {p.method} on {new Date(p.paymentDate).toLocaleDateString("en-IN")}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
