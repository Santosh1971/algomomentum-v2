"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function SignupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });

  async function handleLogin() {
    setLoading(true);
    const res = await signIn("credentials", {
      redirect: false,
      email: form.email,
      password: form.password,
    });
    setLoading(false);
    if (res?.ok) {
      toast.success("Welcome back!");
      router.push("/user/dashboard");
    } else {
      toast.error("Invalid email or password");
    }
  }

  async function handleSignup() {
    setLoading(true);
    const res = await fetch("/api/v1/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      toast.success("Account created! Please log in.");
      setMode("login");
    } else {
      toast.error(data.error ?? "Signup failed");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E3A5F] to-[#0f2440] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-[#1E3A5F] px-8 py-6 text-center">
          <h1 className="text-2xl font-bold text-white">AlgoMomentum</h1>
          <p className="text-blue-200 text-sm mt-1">Bridge Platform v2</p>
        </div>

        <div className="px-8 py-6">
          {/* Tab toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                  mode === m ? "bg-white shadow text-[#1E3A5F]" : "text-gray-500"
                }`}>
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Full Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Santosh Kumar"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            </div>

            <button
              onClick={mode === "login" ? handleLogin : handleSignup}
              disabled={loading}
              className="w-full bg-[#1E3A5F] hover:bg-[#152c4a] text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 mt-2">
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
