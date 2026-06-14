import Link from "next/link";
import Image from "next/image";
export default function ContactUs() {
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
        <h1 className="text-3xl font-bold mb-6 text-white">Contact Us</h1>
        <p className="text-slate-400 mb-8 text-sm leading-relaxed">We are here to help. If you have any questions, suggestions, or concerns, feel free to reach out to us.</p>
        <div className="space-y-4">
          <div className="bg-[#0D1117] border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-slate-300 font-semibold text-sm mb-1">Email</h2>
            <a href="mailto:support@algomomentum.in" className="text-cyan-400 hover:underline text-sm">support@algomomentum.in</a>
          </div>
          <div className="bg-[#0D1117] border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-slate-300 font-semibold text-sm mb-1">Business Hours</h2>
            <p className="text-slate-400 text-sm">Monday to Friday: 10:00 AM to 6:00 PM IST</p>
          </div>
          <div className="bg-[#0D1117] border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-slate-300 font-semibold text-sm mb-1">Feedback</h2>
            <p className="text-slate-400 text-sm">We welcome feedback to improve our services. Drop us a line anytime.</p>
          </div>
        </div>
        <div className="mt-10"><Link href="/" className="text-cyan-400 hover:underline text-sm">Back to Home</Link></div>
      </main>
    </div>
  );
}
