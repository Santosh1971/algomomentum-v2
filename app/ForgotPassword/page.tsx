"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email) { toast.error("Email required"); return; }
    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (res.ok) setSent(true);
    else toast.error("Something went wrong. Please try again.");
  }

  const inp = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] bg-gray-50 placeholder-gray-500";

  return (
    <div className="min-h-screen bg-[#1E3A5F] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#1E3A5F] text-white text-center py-8">
          <h1 className="text-3xl font-bold">AlgoMomentum</h1>
          <p className="text-blue-300 mt-1">Bridge Platform v2</p>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-xl">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="text-5xl">📧</div>
              <h2 className="text-xl font-bold text-[#1E3A5F]">Check your email</h2>
              <p className="text-gray-500 text-sm">If an account exists for <strong>{email}</strong>, we sent a password reset link. Check your inbox and spam folder.</p>
              <button onClick={() => router.push("/Signup")} className="text-[#1E3A5F] text-sm font-medium hover:underline">
                Back to Sign In
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-[#1E3A5F]">Forgot Password</h2>
                <p className="text-gray-500 text-sm mt-1">Enter your email and we'll send you a reset link.</p>
              </div>
              <input value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email address" type="email" className={inp}
                onKeyDown={e => e.key === "Enter" && handleSubmit()} />
              <button onClick={handleSubmit} disabled={loading}
                className="w-full bg-[#1E3A5F] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#152c4a] transition disabled:opacity-50">
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <button onClick={() => router.push("/Signup")} className="w-full text-center text-gray-500 text-sm hover:text-[#1E3A5F]">
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
