"use client";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  accountId: string;
  accountType?: string;
  onSuccess: (accountName: string, deltaUserId: string) => void;
  onClose: () => void;
}

type Step = "form" | "loading" | "success" | "error";

export default function ConnectDeltaModal({ accountId, accountType = "main", onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const isMainAccount = accountType === "main";

  async function handleConnect() {
    if (!apiKey.trim() || !apiSecret.trim()) { toast.error("Both API Key and Secret are required"); return; }
    setStep("loading");
    try {
      const res = await fetch("/api/v1/tradeconfig/verify-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, accountId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setErrMsg(data.error ?? "Invalid credentials"); setStep("error"); return; }
      setAccountName(data.delta_account_name);
      setStep("success");
      onSuccess(data.delta_account_name, data.delta_user_id);
    } catch {
      setErrMsg("Network error. Please try again.");
      setStep("error");
    }
  }

  function handleDeltaOAuth() {
    window.location.href = "/api/auth/delta/authorize";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-white px-6 pt-6 pb-4 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-0 h-0 border-l-[14px] border-l-transparent border-b-[24px] border-b-[#F7931A] border-r-[14px] border-r-transparent" />
            <div className="w-0 h-0 border-l-[14px] border-l-transparent border-t-[24px] border-t-[#27AE60] border-r-[14px] border-r-transparent -ml-2" />
          </div>
          <div>
            <p className="text-xs text-gray-400 leading-none">Connect via</p>
            <p className="text-base font-bold text-gray-800 leading-tight">Delta Exchange India</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 pb-6">
          {(step === "form" || step === "error") && (
            <div className="space-y-4">
              {isMainAccount && (
                <>
                  <button onClick={handleDeltaOAuth}
                    className="w-full bg-[#F7931A] hover:bg-[#e8830a] text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
                    <span>⚡</span> Connect with Delta Exchange
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">or use API key manually</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                </>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">API Key</p>
                <div className="relative">
                  <input type={showKey ? "text" : "password"} placeholder="Paste your Delta API Key"
                    value={apiKey} onChange={e => setApiKey(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22] font-mono" />
                  <button type="button" onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#161B22] font-semibold">
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">API Secret</p>
                <div className="relative">
                  <input type={showSecret ? "text" : "password"} placeholder="Paste your Delta API Secret"
                    value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-[#161B22] font-mono" />
                  <button type="button" onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#161B22] font-semibold">
                    {showSecret ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                🔒 Your credentials are encrypted with AES-256 and never displayed again.
              </div>
              {step === "error" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">❌ {errMsg}</div>
              )}
              <a href="https://india.delta.exchange/app/account/api-management" target="_blank" rel="noopener noreferrer"
                className="block text-center text-xs text-[#161B22] underline">
                How to get your Delta API Key →
              </a>
              <button onClick={handleConnect}
                className="w-full bg-[#161B22] hover:bg-[#0d1117] text-white font-semibold py-3 rounded-xl transition-colors">
                Connect with API Key
              </button>
            </div>
          )}
          {step === "loading" && (
            <div className="py-10 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-[#161B22] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-600">Validating credentials with Delta Exchange...</p>
            </div>
          )}
          {step === "success" && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-3xl">✅</div>
              <div>
                <p className="text-lg font-bold text-gray-800">{accountName}</p>
                <p className="text-sm text-gray-500">Delta Exchange India</p>
              </div>
              <p className="text-xs text-gray-400">Credentials encrypted and saved.</p>
              <button onClick={onClose}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
