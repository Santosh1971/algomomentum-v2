import Link from "next/link";
import Image from "next/image";
export default function TermsAndConditions() {
  const sections = [
    { title: "1. Eligibility", content: "You must be legally eligible to use trading platforms and have an active trading account with Delta Exchange India." },
    { title: "2. Use of Service", content: "You authorize AlgoMomentum to access your trading account using API credentials provided by you for the purpose of automated trade execution based on predefined signals." },
    { title: "3. Risk Disclosure", content: "Trading involves substantial risk. You agree that AlgoMomentum is not liable for any trading losses. All trading decisions are algorithmically driven, and past performance is not indicative of future results." },
    { title: "4. Billing and Payments", content: "Our billing model is strictly postpaid. You are charged a fixed fee per active trading bot at the end of each month. Failure to pay may result in suspension of automated trading services." },
    { title: "5. Termination", content: "You may terminate service at any time by removing API access. AlgoMomentum also reserves the right to suspend or terminate your access if terms are violated." },
    { title: "6. Limitation of Liability", content: "AlgoMomentum is not responsible for losses due to market conditions, broker downtime, or third-party service failures." },
    { title: "7. Modifications", content: "We may revise these Terms at any time. Continued use of the service implies acceptance of the updated Terms." },
  ];
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <nav className="w-full bg-[#0D1117] border-b border-slate-700/60 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
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
        <h1 className="text-3xl font-bold mb-4 text-white">Terms and Conditions</h1>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">These Terms and Conditions govern your use of AlgoMomentum. By using our services, you agree to the following:</p>
        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.title} className="bg-[#0D1117] border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-2">{s.title}</h2>
              <p className="text-slate-400 text-sm leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-xs mt-8">For queries contact <a href="mailto:support@algomomentum.in" className="text-cyan-400 hover:underline">support@algomomentum.in</a></p>
        <div className="mt-6"><Link href="/" className="text-cyan-400 hover:underline text-sm">Back to Home</Link></div>
      </main>
    </div>
  );
}
