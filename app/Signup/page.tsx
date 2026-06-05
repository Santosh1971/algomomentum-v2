// app/Signup/page.tsx
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Mode = "login" | "signup" | "verify" | "details";

export default function SignupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);

  // Step 1 — basic
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  // Step 2 — OTP
  const [otp, setOtp] = useState("");
  // Step 3 — personal details
  const [details, setDetails] = useState({ phone: "", city: "", district: "", country: "India", gender: "", age: "" });

  async function handleLogin() {
    if (!form.email || !form.password) { toast.error("Email and password required"); return; }
    setLoading(true);
    const res = await signIn("credentials", { redirect: false, email: form.email, password: form.password });
    setLoading(false);
    if (res?.ok) { toast.success("Welcome back!"); router.push("/user/dashboard"); }
    else toast.error("Invalid email or password");
  }

  async function handleSignup() {
    if (!form.email || !form.password || !form.name) { toast.error("All fields required"); return; }
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
    if (res.ok) { toast.success("Email verified!"); setMode("details"); }
    else toast.error(data.error ?? "Invalid OTP");
  }

  async function handleDetails() {
    // Save personal details
    if (details.phone || details.city) {
      await fetch("/api/v1/user/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, name: form.name, ...details }),
      });
    }
    toast.success("Registration complete! Please log in.");
    setMode("login");
  }

  const inp = "w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E3A5F] to-[#0f2440] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-[#1E3A5F] px-8 py-6 text-center">
          <h1 className="text-2xl font-bold text-white">AlgoMomentum</h1>
          <p className="text-blue-200 text-sm mt-1">Bridge Platform v2</p>
        </div>

        <div className="px-8 py-6">
          {/* Login / Signup tabs */}
          {(mode === "login" || mode === "signup") && (
            <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
              {(["login", "signup"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === m ? "bg-white shadow text-[#1E3A5F]" : "text-gray-500"}`}>
                  {m === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          {/* STEP 1: Login */}
          {mode === "login" && (
            <div className="space-y-4">
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                placeholder="Email address" type="email" className={inp} />
              <input value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                placeholder="Password" type="password" className={inp}
                onKeyDown={e => e.key === "Enter" && handleLogin()} />
              <button onClick={handleLogin} disabled={loading}
                className="w-full bg-[#1E3A5F] hover:bg-[#152c4a] text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          )}

          {/* STEP 1: Signup */}
          {mode === "signup" && (
            <div className="space-y-4">
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                placeholder="Full name" className={inp} />
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                placeholder="Email address" type="email" className={inp} />
              <input value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                placeholder="Password (min 6 chars)" type="password" className={inp} />
              <button onClick={handleSignup} disabled={loading}
                className="w-full bg-[#1E3A5F] hover:bg-[#152c4a] text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
                {loading ? "Sending OTP..." : "Create Account"}
              </button>
            </div>
          )}

          {/* STEP 2: OTP Verification */}
          {mode === "verify" && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-2xl mb-2">📧</p>
                <h2 className="font-bold text-[#1E3A5F] text-lg">Verify your email</h2>
                <p className="text-sm text-gray-500 mt-1">We sent a 6-digit OTP to <span className="font-medium">{form.email}</span></p>
              </div>
              <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP" className={`${inp} text-center text-2xl tracking-widest font-mono`}
                maxLength={6} onKeyDown={e => e.key === "Enter" && handleVerify()} />
              <button onClick={handleVerify} disabled={loading || otp.length !== 6}
                className="w-full bg-[#1E3A5F] hover:bg-[#152c4a] text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
              <button onClick={handleSignup} className="w-full text-sm text-gray-400 hover:text-gray-600">
                Resend OTP
              </button>
            </div>
          )}

          {/* STEP 3: Personal Details */}
          {mode === "details" && (
            <div className="space-y-3">
              <div className="text-center mb-2">
                <p className="text-2xl mb-1">👤</p>
                <h2 className="font-bold text-[#1E3A5F] text-lg">Personal Details</h2>
                <p className="text-xs text-gray-400">Optional — helps us serve you better</p>
              </div>
              <input value={details.phone} onChange={e => setDetails({...details, phone: e.target.value})}
                placeholder="Mobile number" className={inp} />
              <div className="grid grid-cols-2 gap-3">
                <input value={details.city} onChange={e => setDetails({...details, city: e.target.value})}
                  placeholder="City" className={inp} />
                <input value={details.district} onChange={e => setDetails({...details, district: e.target.value})}
                  placeholder="District" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={details.gender} onChange={e => setDetails({...details, gender: e.target.value})} className={inp}>
                  <option value="">Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
                <input value={details.age} onChange={e => setDetails({...details, age: e.target.value})}
                  placeholder="Age" type="number" className={inp} />
              </div>
              <input value={details.country} onChange={e => setDetails({...details, country: e.target.value})}
                placeholder="Country" className={inp} />
              <button onClick={handleDetails} disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
                Complete Registration
              </button>
              <button onClick={() => { setMode("login"); toast.success("Registration complete! Please log in."); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600">
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
