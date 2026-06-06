"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Mode = "login" | "signup" | "verify" | "pending";

export default function SignupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "", password: "", name: "",
    phone: "", city: "", district: "", country: "India", gender: "", age: ""
  });
  const [otp, setOtp] = useState("");

  async function handleLogin() {
    if (!form.email || !form.password) { toast.error("Email and password required"); return; }
    setLoading(true);
    const res = await signIn("credentials", { redirect: false, email: form.email, password: form.password });
    setLoading(false);
    if (res?.ok) { toast.success("Welcome back!"); router.push("/user/dashboard"); }
    else {
      const msg = res?.error ?? "Invalid email or password";
      toast.error(msg.includes("approval") ? "Account pending admin approval" : msg.includes("verify") ? "Please verify your email first" : "Invalid email or password");
    }
  }

  async function handleSignup() {
    if (!form.email || !form.password || !form.name) { toast.error("Name, email and password required"); return; }
    if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    const res = await fetch("/api/v1/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { toast.success("OTP sent to your email!"); setMode("verify"); }
    else toast.error(data.error ?? "Signup failed");
  }

  async function handleVerify() {
    if (!otp || otp.length !== 6) { toast.error("Enter the 6-digit OTP"); return; }
    setLoading(true);
    const res = await fetch("/api/v1/user", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email, otp }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { setMode("pending"); }
    else toast.error(data.error ?? "Invalid OTP");
  }

  const inp = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] bg-gray-50";
  const set = (k: string) => (e: any) => setForm({...form, [k]: e.target.value});

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E3A5F] to-[#0f2440] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-[#1E3A5F] px-8 py-6 text-center">
          <h1 className="text-2xl font-bold text-white">AlgoMomentum</h1>
          <p className="text-blue-200 text-sm mt-1">Bridge Platform v2</p>
        </div>

        <div className="px-8 py-6">
          {(mode === "login" || mode === "signup") && (
            <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
              {(["login", "signup"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === m ? "bg-white shadow text-[#1E3A5F]" : "text-gray-500"}`}>
                  {m === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          {mode === "login" && (
            <div className="space-y-3">
              <input value={form.email} onChange={set("email")} placeholder="Email address" type="email" className={inp} />
              <input value={form.password} onChange={set("password")} placeholder="Password" type="password" className={inp}
                onKeyDown={e => e.key === "Enter" && handleLogin()} />
              <button onClick={handleLogin} disabled={loading}
                className="w-full bg-[#1E3A5F] hover:bg-[#152c4a] text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          )}

          {mode === "signup" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Basic Info</p>
              <input value={form.name} onChange={set("name")} placeholder="Full name *" className={inp} />
              <input value={form.email} onChange={set("email")} placeholder="Email address *" type="email" className={inp} />
              <input value={form.password} onChange={set("password")} placeholder="Password (min 6 chars) *" type="password" className={inp} />

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Personal Details</p>
              <input value={form.phone} onChange={set("phone")} placeholder="Mobile number" className={inp} />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.city} onChange={set("city")} placeholder="City" className={inp} />
                <input value={form.district} onChange={set("district")} placeholder="District" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={form.gender} onChange={set("gender")} className={inp}>
                  <option value="">Gender</option>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
                <input value={form.age} onChange={set("age")} placeholder="Age" type="number" className={inp} />
              </div>
              <input value={form.country} onChange={set("country")} placeholder="Country" className={inp} />

              <button onClick={handleSignup} disabled={loading}
                className="w-full bg-[#1E3A5F] hover:bg-[#152c4a] text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mt-2">
                {loading ? "Sending OTP..." : "Create Account"}
              </button>
            </div>
          )}

          {mode === "verify" && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-3xl mb-2">📧</p>
                <h2 className="font-bold text-[#1E3A5F] text-lg">Verify your email</h2>
                <p className="text-sm text-gray-500 mt-1">OTP sent to <span className="font-medium">{form.email}</span></p>
              </div>
              <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP" maxLength={6}
                className={`${inp} text-center text-2xl tracking-widest font-mono`}
                onKeyDown={e => e.key === "Enter" && handleVerify()} />
              <button onClick={handleVerify} disabled={loading || otp.length !== 6}
                className="w-full bg-[#1E3A5F] hover:bg-[#152c4a] text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
              <button onClick={async () => {
                const res = await fetch("/api/v1/user/resend-otp", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: form.email }),
                });
                const d = await res.json();
                if (res.ok) toast.success("OTP resent! Check your email.");
                else toast.error(d.error ?? "Failed to resend");
              }} className="w-full text-sm text-gray-400 hover:text-gray-600">Resend OTP</button>
            </div>
          )}

          {mode === "pending" && (
            <div className="text-center space-y-4 py-4">
              <p className="text-4xl">⏳</p>
              <h2 className="font-bold text-[#1E3A5F] text-lg">Registration Complete!</h2>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
                <p className="font-semibold">Pending Admin Approval</p>
                <p className="mt-1 text-xs">Your account has been verified. An admin will review and activate your account shortly. You will be able to login once approved.</p>
              </div>
              <button onClick={() => setMode("login")}
                className="w-full bg-[#1E3A5F] text-white font-semibold py-3 rounded-xl transition hover:bg-[#152c4a]">
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
