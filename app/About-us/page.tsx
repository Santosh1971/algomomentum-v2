import Link from "next/link";
import Image from "next/image";
export default function AboutUs() {
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
        <h1 className="text-3xl font-bold mb-6 text-white">About AlgoMomentum</h1>
        <div className="space-y-5 text-slate-400 leading-relaxed text-sm">
          <p>AlgoMomentum is a fully automated trading platform designed to help retail traders automate their strategies with ease. Our users simply connect their trading accounts via secure API keys, and our system executes signals directly into their account.</p>
          <p>We operate on a postpaid model. No upfront payment required. You are charged a fixed monthly fee per active trading bot. Billing occurs at the end of each month based on active usage.</p>
          <p>Our service is non-intrusive. You can stop trading at any time, delete your API access, and walk away with no strings attached. If dues are unpaid, automated trading is automatically disabled.</p>
          <p>At AlgoMomentum, our goal is to make algo trading accessible, performance-driven, and hassle-free for every retail trader in India.</p>
        </div>
        <div className="mt-10"><Link href="/" className="text-cyan-400 hover:underline text-sm">Back to Home</Link></div>
      </main>
    </div>
  );
}
