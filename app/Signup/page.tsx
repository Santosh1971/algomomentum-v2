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
    phone: "", city: "", country: "India", gender: "", age: "", confirmPassword: ""
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
    if (form.password !== form.confirmPassword) { toast.error("Passwords do not match"); return; }
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

  const inp = "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground";
  const inpStyle = {};
  const set = (k: string) => (e: any) => setForm({...form, [k]: e.target.value});

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-border/20">
        <div className="bg-card px-8 py-6 flex flex-col items-center gap-3">
          <img src="/alm-logo.png" alt="AlgoMomentum" width="64" height="64" style={{borderRadius:"12px", objectFit:"cover"}} />
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">AlgoMomentum</h1>
            <p className="text-cyan-400 text-xs mt-0.5 uppercase tracking-wider">Bridge Platform v2</p>
          </div>
        </div>

        <div className="px-8 py-6">
          {(mode === "login" || mode === "signup") && (
            <div className="flex bg-muted rounded-xl p-1 mb-5">
              {(["login", "signup"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === m ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>
                  {m === "login" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}

          {mode === "login" && (
            <div className="space-y-3">
              <input value={form.email} onChange={set("email")} placeholder="Email address" type="email" className={inp} style={inpStyle} />
              <input value={form.password} onChange={set("password")} placeholder="Password" type="password" className={inp} style={inpStyle}
                onKeyDown={e => e.key === "Enter" && handleLogin()} />
              <button onClick={handleLogin} disabled={loading}
                style={{backgroundColor:"#0ea5e9", color:"white"}} className="w-full hover:opacity-90 font-semibold py-3 rounded-xl transition disabled:opacity-50">
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <div className="text-center">
                <a href="/ForgotPassword" className="text-sm text-foreground hover:underline font-medium">Forgot password?</a>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Basic Info</p>
              <input value={form.name} onChange={set("name")} placeholder="Full name *" className={inp} style={inpStyle} />
              <input value={form.email} onChange={set("email")} placeholder="Email address *" type="email" className={inp} style={inpStyle} />
                <p className="text-xs text-orange-500 mt-1">⚠️ Use the same email registered on Delta Exchange India — required to connect your trading account.</p>
              <input value={form.password} onChange={set("password")} placeholder="Password (min 6 chars) *" type="password" className={inp} style={inpStyle} />
              <input value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="Confirm Password *" type="password" className={inp} style={inpStyle} />

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Personal Details</p>
              <input value={form.phone} onChange={set("phone")} placeholder="Mobile number" className={inp} style={inpStyle} />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.gender} onChange={set("gender")} className={inp}>
                  <option value="">Gender</option>
                  <option>Male</option><option>Female</option><option>Other</option>
                </select>
                <input value={form.age} onChange={set("age")} placeholder="Age" type="number" className={inp} style={inpStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={form.city} onChange={set("city")} placeholder="City" className={inp} style={inpStyle} />
                <input value={form.country} onChange={set("country")} placeholder="Country" className={inp} style={inpStyle} />
              </div>

              <button onClick={handleSignup} disabled={loading}
                style={{backgroundColor:"#0ea5e9", color:"white"}} className="w-full hover:opacity-90 font-semibold py-3 rounded-xl transition disabled:opacity-50 mt-2">
                {loading ? "Sending OTP..." : "Create Account"}
              </button>
            </div>
          )}

          {mode === "verify" && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-3xl mb-2">📧</p>
                <h2 className="font-bold text-foreground text-lg">Verify your email</h2>
                <p className="text-sm text-gray-500 mt-1">OTP sent to <span className="font-medium">{form.email}</span></p>
              </div>
              <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP" maxLength={6}
                style={inpStyle} className={`${inp} text-center text-2xl tracking-widest font-mono`}
                onKeyDown={e => e.key === "Enter" && handleVerify()} />
              <button onClick={handleVerify} disabled={loading || otp.length !== 6}
                style={{backgroundColor:"#0ea5e9", color:"white"}} className="w-full hover:opacity-90 font-semibold py-3 rounded-xl transition disabled:opacity-50">
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
              <p className="text-4xl">✅</p>
              <h2 className="font-bold text-foreground text-lg">Email Verified!</h2>
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-sm text-green-600">
                <p className="font-semibold">Account created successfully!</p>
                <p className="mt-1 text-xs">Next step: Connect your Delta Exchange account to start trading.</p>
              </div>
              <button onClick={async () => {
                const res = await signIn("credentials", { email: form.email, password: form.password, redirect: false })
                if (res?.ok) router.push("/marketplace?welcome=1")
                else setMode("login")
              }}
                style={{backgroundColor:"#0ea5e9", color:"white"}} className="w-full hover:opacity-90 font-semibold py-3 rounded-xl transition">
                Go to Marketplace →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
