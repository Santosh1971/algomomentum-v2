import Link from "next/link";
import Image from "next/image";
export default function ContactUs() {
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
      <main      <main"m      <main      <main"m      <main      <main"m      <main      <maind       <main      <main"m    /h      <main      <main"m    t-sl      <main      <main"m      <maied">      here       <main      <main"m      <main      <main"m      <marn      <main      <main"m      <main      <main"m      <main      <main"m      <main      <maind       <main      <main"m    /h      algomomentum.in", href: "mailto:support@algomomentum.in" },
                                                                                                                        label: "Feedback", value: "We welcome feedback to improve o                                                                                             <div key={item.label} className="bg-[#0F172A] border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-slate-300 font-semibold text-sm mb-1">{item.label}</h2>
              {item.href ? (
                <a href={item.href} className="text-cyan-400 hover:underline text-sm">{item.value}</a>
              ) : (
                <p className="text-slate-400 text-sm">{item.value}</p>
              )}
            </div>
          ))}
        </div>
        <div className="mt-10"><Link href="/" className="text-cyan-400 hover:underline text-sm">← Back to Home</Link></div>
      </main>
    </div>
  );
}
