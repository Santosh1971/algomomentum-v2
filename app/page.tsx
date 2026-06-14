import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white flex flex-col">
      <nav className="w-full bg-[#0F172A] border-b border-slate-700/60 px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-2.5">
          <Image src="/alm-logo.png" alt="AlgoMomentum" width={40} height={40} className="rounded-lg object-cover" priority />
          <div className="flex flex-col leading-tight">
            <span className="text-white font-semibold text-sm tracking-wide">AlgoMomentum</span>
            <span className="text-cyan-400 text-[10px] font-normal tracking-wider uppercase">Bridge Platform v2</span>
          </div>
        </div>
        <Link href="/Signup" className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm px-5 py-2 rounded-lg transition">Sign In</Link>
      </nav>
      <section className="flex flex-col items-center justify-center text-center px-6 py-24 bg-gradient-to-b from-[#0F172A] to-[#0A0F1E]">
        <Image src="/alm-logo.png" alt="ALM" width={100} height={100} className="rounded-2xl object-cover mx-auto shadow-2xl shadow-cyan-500/20 mb-8" />
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
          Automate Your <span className="text-cyan-400">Crypto Trading</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mb-8">
          AlgoMomentum bridges your TradingView alerts directly to Delta Exchange India. Execute trades 24/7 with no emotions, no delays, no manual effort.
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <Link href="/Signup" className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-3 rounded-xl text-sm transition shadow-lg shadow-cyan-500/30">Get Started</Link>
          <a href="#features" className="border border-slate-600 hover:border-cyan-400 text-slate-300 hover:text-cyan-400 font-semibold px-8 py-3 rounded-xl text-sm transition">Learn More</a>
        </div>
      </section>
      <section id="features" className="px-6 py-20 max-w-6xl mx-auto w-full">
        <h2 className="text-3xl font-bold text-center mb-12">Why AlgoMomentum?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: "⚡", title: "Instant Signal Execution", desc: "TradingView webhook fires and trade is placed on Delta Exchange in milliseconds. No lag, no missed entries." },
            { icon: "📊", title: "Multi-Account Support", desc: "Manage up to 5 Delta Exchange sub-accounts per user. Run different strategies simultaneously." },
            { icon: "🔒", title: "Secure and Encrypted", desc: "API keys are encrypted at rest. Role-based access with admin approval for every new user." },
            { icon: "📈", title: "Real-Time PnL Tracking", desc: "Track daily, weekly, and monthly PnL across all accounts from a single dashboard." },
            { icon: "🤖", title: "Strategy Backtester", desc: "Test PDH/PDL, EMA Cross, and ALM3 strategies on historical data before going live." },
            { icon: "🇮🇳", title: "Built for India", desc: "Designed for Delta Exchange India. Postpaid billing, Indian support, Indian servers." },
          ].map((f) => (
            <div key={f.title} className="bg-[#0F172A] border border-slate-700/50 rounded-2xl p-6 hover:border-cyan-500/40 transition">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="px-6 py-20 bg-[#0F172A] w-full">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6 text-center">
            {[
              { step: "01", title: "Sign Up", desc: "Create your account and get admin approval" },
              { step: "02", title: "Connect Delta", desc: "Add your Delta Exchange API key securely" },
              { step: "03", title: "Configure Strategy", desc: "Set your symbols, lot size, and trade config" },
              { step: "04", title: "Go Live", desc: "Point your TradingView webhook to AlgoMomentum" },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold text-sm mb-3">{s.step}</div>
                <h3 className="font-semibold text-white mb-1">{s.title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="px-6 py-16 text-center max-w-3xl mx-auto">
        <div className="bg-[#0F172A] border border-cyan-500/20 rounded-2xl p-8">
          <div className="text-4xl mb-4">💰</div>
          <h2 className="text-2xl font-bold mb-3">Postpaid. No Upfront Cost.</h2>
          <p className="text-slate-400 text-sm leading-relaxed">We operate on a postpaid model. No upfront payment required. You are charged a fixed monthly fee per active trading bot, billed at the end of each month. Stop anytime, no strings attached.</p>
        </div>
      </section>
      <section className="px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Automate?</h2>
        <p className="text-slate-400 mb-8 max-w-xl mx-auto">Join AlgoMomentum and let your strategies run while you sleep. Powered by Delta Exchange India.</p>
        <Link href="/Signup" className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-10 py-4 rounded-xl text-base transition shadow-lg shadow-cyan-500/30">Create Your Account</Link>
      </section>
      <footer className="bg-[#0F172A] border-t border-slate-700/60 px-6 py-10 mt-auto">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Image src="/alm-logo.png" alt="ALM" width={32} height={32} className="rounded-lg object-cover" />
                <span className="text-white font-semibold text-sm">AlgoMomentum</span>
              </div>
              <p className="text-slate-500 text-xs leading-relaxed">Automated algo trading bridge for Delta Exchange India.</p>
            </div>
            <div>
              <h4 className="text-slate-300 font-semibold text-sm mb-3">Platform</h4>
              <ul className="space-y-2 text-slate-500 text-xs">
                <li><Link href="/Signup" className="hover:text-cyan-400 transition">Sign In</Link></li>
                <li><Link href="/Signup" className="hover:text-cyan-400 transition">Create Account</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-300 font-semibold text-sm mb-3">Legal</h4>
              <ul className="space-y-2 text-slate-500 text-xs">
                <li><Link href="/terms-and-conditions" className="hover:text-cyan-400 transition">Terms and Conditions</Link></li>
                <li><Link href="/Privacy-Policy" className="hover:text-cyan-400 transition">Privacy Policy</Link></li>
                <li><Link href="/refund-and-cancellation-policy" className="hover:text-cyan-400 transition">Refund and Cancellation</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-300 font-semibold text-sm mb-3">Company</h4>
              <ul className="space-y-2 text-slate-500 text-xs">
                <li><Link href="/About-us" className="hover:text-cyan-400 transition">About Us</Link></li>
                <li><Link href="/Contact-us" className="hover:text-cyan-400 transition">Contact Us</Link></li>
                <li><a href="mailto:support@algomomentum.in" className="hover:text-cyan-400 transition">support@algomomentum.in</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700/60 pt-6 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-slate-600 text-xs">2026 AlgoMomentum. All rights reserved.</p>
            <p className="text-slate-600 text-xs">Powered by Delta Exchange India</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
