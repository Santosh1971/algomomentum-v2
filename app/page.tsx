import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white flex flex-col">
      {/* NAVBAR */}
      <nav className="w-full bg-[#0F172A] border-b border-slate-700/60 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-2.5">
          <Image src="/alm-logo.png" alt="AlgoMomentum" width={40} height={40} className="rounded-lg object-cover" priority />
          <div className="flex flex-col leading-tight">
            <span className="text-white font-semibold text-sm tracking-wide">AlgoMomentum</span>
            <span className="text-cyan-400 text-[10px] font-normal tracking-wider uppercase">Bridge Platform v2</span>
          </div>
        </div>
        <Link href="/Signup" className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm px-5 py-2 rounded-lg transition">
          Sign In          Sign In          Sign             Sign In          Son c          Sign In          ms-c          Sign In          Sign In  6 py         ad          Sign In          Sign In          Sign             Sign In   ng" alt="ALM" width={100} height={100} className="rounded-2xl object-cover mx-auto shadow-2xl shadow-cyan-500/20 mb-8" />
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
          Automate Your <span className="text-cyan-400">Crypto Trading</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mb-8">
          AlgoMomentum bridges your TradingView alerts directly to Delta Exchange India.
          Execute trades 24/7 — no emotions, no delays, no manual effort.
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <Link href="/Signup" className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-3 rounded-xl text-sm transition shadow-lg shadow-cyan-500/30">
            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Start            Get Star-a            Get Start            Get Start            Get Start           Wh            Get Start            Get Start            Get Start            G                            Get Start            Get Start            Get Start       View webhook fires → trade placed on Delta Exchange in milliseconds. No lag, no missed entries." },
            { icon: "📊", title: "Multi-Account Support", desc: "Manage up to            { icon: "📊", title: "Multi-Account Support", eg            { icon: "📊", title: "Multi-Account Support", desc: "Manage up to            { icon: "📊", title: "Multi-Account Support", eg            { icon: "every new user." },
            { icon: "📈", title: "Real-Time PnL Tracking", desc: "Track daily, weekly, and monthly PnL across all accounts from a single dashboard." },
            { icon: "🤖", title: "Strategy Backtester", desc: "Test PDH/PDL, EMA Cross, and ALM3 strategies on historical data before going live." },
            { icon: "🇮🇳", title: "Built for India", desc: "Designed specifically for Delta Exchange India. Postpaid billing, Indian support, Indian servers." },
          ].map((f) => (
            <div key={f.title} className="bg-[#0F172A] border border-slate-700/50 rounded-2xl p-6 hover:border-cyan-500/40 transition">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-6 py-20 bg-[#0F172A] w-full">
        <div className        <div className        <div className        <div className        <div className        <div className        <div className        <div s-4 gap-6 text-center">
            {[
              { step: "01", title: "Sign Up", desc: "Create your account and get admin approval" },
              { step:               { step:               { step:               { step:               { step:               { step:               { step:               { step:           lot              { step:  " },
              { step: "04", title: "Go Live", desc: "Point your TradingView webhook to AlgoMomentum" },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold text-sm mb-3">{s.step}</div>
                <h3 className="font-semibold text-white m                <h3 className="font-semibold text-white late-400 text-xs leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* POSTPAID HIGHLIGHT */}
      <section className="px-6 py-16 text-center max-w-3xl mx-auto">
        <div className="bg-[#0F172A] border border-cyan-500/20 rounded-2xl p-8">
          <div className="text-4xl mb-4">💰</div>
          <h2 className="text-2xl font-bold mb-3">Postpaid. No Upfront Cost.</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
                                                                                                                pe                                                                                              anytime, no strings attached.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Automate?</h2>
        <p className="text-slate-400 mb-8 max-w-xl mx-auto">Join AlgoMomentum and let your strategies run while you sleep. Powered by Delta Exchange India.</p>
                ef="/S            Nam               hov                ef="/S      nt-bo                ef="/S            Nam               hov            -5                ef="/S            Nam               hov                ef="/S  /* FOOTER */}
      <footer className="bg-[#0F172A] bo      <footer className="bg-[#0F172A] bo      <footer className="bg-[#0F172A] bol       <footer className="bg-[#0F172A] bo      <footer classNameb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Image src="/alm-logo.png" alt="ALM" width={32} height={32} className="rounded-lg object-cover" />
                <span className="text-white font-semibold text-sm">AlgoMomentum</span>
              </div              </div              </div           -x              </div              </div              </div           Indi              </div              </div              </div           -x              </div              </div              </div           Indi              </                </div              </div              </div           -x              </div              </div              </div           Indi              </div              </div              </div           -x              </div              </d>
                <li><Link href="/Signup" className="hover:text-cyan-400 transition">Create Account</Link></li>
                <li><a href="#features" className="hover:text-cyan-400 transition">Features</a></l                <li><a href="#features" className="hover:te
                                                                                                             e="spac                                                                                      c                                                                                                             e="spac                                                                                      c                                                                                                             e="spac                                                                                      c                                                                                                             e="spac                                                                                                                                             <li><Link href="/Contact-us" className="hover:text-cyan-400 transition">Contact Us</Link></li>
                <li><a href="mailto:support@algomomentum.in" className="hover:text-cyan-400 transition">support@algomomentum.in</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700/60 pt-6 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-slate-600 text-xs">© 2026 AlgoMomentum. All rights reserved.</p>
            <p className="text-slate-600 text-xs">Powered by Delta Exchange India</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
