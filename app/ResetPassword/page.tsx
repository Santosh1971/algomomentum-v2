"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token || !email) { toast.error("Invalid reset link"); router.push("/Signup"); }
  }, [token, email, router]);

  async function handleReset() {
    if (!password || !confirm) { toast.error("Please fill in both fields"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setDone(true);
    else toast.error(data.error ?? "Reset failed. Please try again.");
  }

  const inp = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22] bg-gray-50 placeholder-gray-500";

  return (
    <div className="min-h-screen bg-[#161B22] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[#161B22] text-white text-center py-8">
          <h1 className="text-3xl font-bold">AlgoMomentum</h1>
          <p className="text-cyan-400 mt-1">Bridge Platform v2</p>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-xl">
          {done ? (
            <div className="text-center space-y-4">
              <div className="text-5xl">✅</div>
              <h2 className="text-xl font-bold text-[#161B22]">Password Reset!</h2>
              <p className="text-gray-500 text-sm">Your password has been updated. You can now sign in with your new password.</p>
              <button onClick={() => router.push("/Signup")}
                className="w-full bg-[#161B22] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#161B22] transition">
                Go to Sign In
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-[#161B22]">Reset Password</h2>
                <p className="text-gray-500 text-sm mt-1">Enter your new password below.</p>
              </div>
              <input value={password} onChange={e => setPassword(e.target.value)}
                placeholder="New password (min 6 chars)" type="password" className={inp} />
              <input value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Confirm new password" type="password" className={inp}
                onKeyDown={e => e.key === "Enter" && handleReset()} />
              <button onClick={handleReset} disabled={loading}
                className="w-full bg-[#161B22] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#161B22] transition disabled:opacity-50">
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordForm /></Suspense>;
}
