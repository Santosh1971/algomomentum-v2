import Link from "next/link";
import Image from "next/image";
export default function TermsAndConditions() {
  const sections = [
    { title: "1. Eligibility", content: "You must be legally eligible to use trading platforms and have an active trading account with Delta Exchange India." },
    { title: "2. Use of Service", content: "You authorize AlgoMomentum to access your trading account using API credentials provided by you for the purpose of automated trade execution based on predefined signals." },
    { title: "3. Risk Disclosure", content: "Trading involves substantial risk. You agree that AlgoMomentum is not liable for any trading losses. All trading decisions are algorithmically driven, and past performance is not indicative of future results." },
    { title: "4. Billing and Payments", content: "Our billing model is strictly postpaid. You are charged a fixed fee per active trading bot at     { title: "4. Bith    { title: "4. Billing and Payments", content: "Our billing model is strictly postpaid. es    { title: "4. Billi Termination", content: "You may termina    { title: "4. Billing and Payments", conte.     { title: "4. Bies    { title: "4. Billing and Payments", content: "Our billing model is strictly postpaid. You are charged a fixed fee per active trading bot at     { title: "4ib    { title: "4. Billing and Payments", content: "Our billing model is strictly postpaid. You are charged a fixed fee per active trading bot at     { title: "4. Bith    { title: "4. Billing and Payments", content: "Oeptance of the updated Terms." },
  ];
  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white">
      <nav className="w-full bg-[#0F172A] border-b border-slate-700/60 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr        <Link hr     mb-8 leading-relaxed">These Terms and Conditions govern your use of AlgoMomentum's automated trading platform. By using our services, you agree to the following:</p>
        <div className="space-y-6">
          {sections.map((s) => (
            <div key={s.title} className="bg-[#0F172A] border border-slate-700/50 rounded-xl p-5">
              <h2 className="text-white font-semibold text-sm mb-2">{s.title}</h2>
              <p className="text-slate-400 text-sm leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-500 text-xs mt-8">For any queries, contact us at <a href="mailto:support@algomomentum.in" className="text-cyan-400 hover:underline">support@algomomentum.in</a></p>
        <div className="mt-6"><Link href="/" className="text-cyan-400 hover:underline text-sm">← Back to Home</Link></div>
      </main>
    </div>
  );
}
