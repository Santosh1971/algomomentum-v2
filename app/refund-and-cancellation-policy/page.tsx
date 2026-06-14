import Link from "next/link";
import Image from "next/image";
export default function RefundPolicy() {
  const sections = [
    { title: "1. No Upfront Charges", content: "We do not take any upfront payments. Charges are only applied after profitable trading cycles, based on net PnL." },
    { title: "2. Cancellation Policy", content: "You may cancel our service at any time by revoking your API access or deleting your trading bot. No fees are charged after cancellation." },
    { title: "3. Refund Policy", content: "Since we only charge a percentage of actual profit, and no payment is collected unless profits are made, no refund is necessary. We do not offer refunds on billed PnL once charged." },
    { title: "4. Disputes", content: "If you believe a billing error has occurred, please contact us at support@algomomentum.in within 7 days of receiving the invoice." },
    { title: "5. Service Suspension", content: "If payment is not completed after a billing cycle, automated trading will be temporarily disabled until dues are cleared." },
  ];
  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white">
      <nav className="w-full bg-[#0F172A] border-b border-slate-700/60 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/alm-logo.png" alt="AlgoMomentum" width={36} height={36} className="rounded-lg object-cover" />
          <div className="flex flex-col leading-tight">
            <span className="text-white font-semibold text-sm">AlgoMomentum</span>
            <span className="text-cyan-400 text-[10px] uppercase tracking-wider">Bridge Platform v2</span>
          </div>
        </Link>
        <Link href="/Signup" className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm px-5 py-2 rounded-lg transition">Sign In</Link>
      </nav>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-4 text-white">Refund and Cancellation Policy</h1>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">At AlgoMomentum, we operate on a postpaid billing model, meaning users are only charged after profits are realized.</p>
        <div className="space-y-6">
          {sections.map((s) => (
            <div key={s.title} className="bg-[#0F172A] border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-2">{s.title}</h2>
              <p className="text-slate-400 text-sm leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
        <div className="mt-10"><Link href="/" className="text-cyan-400 hover:underline text-sm">Back to Home</Link></div>
      </main>
    </div>
  );
}
