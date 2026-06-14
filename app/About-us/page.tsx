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
      <main classNa  ="max-w-3      <main classNa  ="max-w-3      <main classNa  ="max-w-3      mb      <main classNa  ="max-wen      <main classNa  ="max-wame=      <main classNa  ="max-w-3    re      <mat-      <main classNa  ="max-w-3      <main classNa  ="mading      <main classNa  ="max-w-3      <main classNa  ="max-w-3      <main classNa  ="max-w-3      mb      <main classNa  ="max-wen     cu      <main classNa  ="max-w-3      <main classNa  ="max-w-their account.</p>
          <p>We operate on a postpaid model — no upfront payment required. You are charged a fixed monthly fee per active trading bot. Billing occurs at the end of each month based on active usage.</p>
          <p>Our service is non-intrusive — you can stop trading at any time, delete your API access, and walk away with no strings attached. If dues are unpaid, automated tra          <p>Our service is non-intrusive — you can stop trading at any time, delete your API access, and walk away with no strings attached. If dur every retail trader in India.</p>
        </div>
        <div className="mt-10"><Link href="/" className="text-cyan-400 hover:underline text-sm">← Back to Home</Link></div>
      </main>
    </div>
  );
}
