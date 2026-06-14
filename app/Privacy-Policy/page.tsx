import Link from "next/link";
import Image from "next/image";
export default function PrivacyPolicy() {
  const sections = [
    { title: "1. Information We Collect", content: "We collect email and contact information, API credentials encrypted and used only for executing trades, and trading performance and usage statistics." },
    { title: "2. How We Use Your Information", content: "Your data is used to automate trades securely, calculate net PnL for billing, and improve and personalize your experience." },
    { title: "3. Data Protection", content: "We use industry-standard encryption and security practices to store and process your data. API credentials are never shared or exposed." },
    { title: "4. Third Parties", content: "We do not sell or rent your data. Data is only shared with trusted infrastructure services necessary for trading operations." },
    { title: "5. Your Control", content: "You can delete your API keys or stop the service anytime. Your data will be permanently deleted upon request." },
    { title: "6. Changes", content: "We may update this policy from time to time. You will be notified of any major changes." },
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
        <h1 className="text-3xl font-bold mb-4 text-white">Privacy Policy</h1>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">At AlgoMomentum, we are committed to protecting your personal and financial data.</p>
        <div className="space-y-4">
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
