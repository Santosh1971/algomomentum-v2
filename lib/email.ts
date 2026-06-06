import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "AlgoMomentum <noreply@algomomentum.in>";

export async function sendVerificationEmail(email: string, name: string, otp: string) {
  try {
    await resend.emails.send({
      from: FROM, to: email,
      subject: "Your AlgoMomentum verification code",
      html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px">
        <div style="background:#1E3A5F;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px">
          <h1 style="color:white;margin:0;font-size:24px">AlgoMomentum</h1>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:14px">Bridge Platform v2</p>
        </div>
        <h2 style="color:#1E3A5F">Welcome, ${name}!</h2>
        <p style="color:#6b7280">Your verification code is:</p>
        <div style="background:white;border:2px solid #1E3A5F;border-radius:8px;padding:24px;text-align:center;margin:24px 0">
          <h1 style="margin:0;color:#1E3A5F;font-size:48px;letter-spacing:8px;font-family:monospace">${otp}</h1>
          <p style="color:#9ca3af;font-size:12px;margin:8px 0 0">Expires in 10 minutes</p>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center">If you did not create this account, ignore this email.</p>
      </div>`,
    });
    console.log("Verification email sent to", email);
  } catch (e) {
    console.error("Email send failed:", e);
    console.log("OTP for", email, ":", otp);
  }
}

export async function sendWelcomeEmail(email: string, name: string) {
  try {
    await resend.emails.send({
      from: FROM, to: email,
      subject: "Welcome to AlgoMomentum Bridge!",
      html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:32px">
        <div style="background:#1E3A5F;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px">
          <h1 style="color:white;margin:0">AlgoMomentum</h1>
        </div>
        <h2 style="color:#1E3A5F">Welcome aboard, ${name}!</h2>
        <p style="color:#6b7280">Your account is now active. Connect your Delta Exchange API keys to start trading.</p>
        <div style="text-align:center;margin-top:24px">
          <a href="https://algomomentum-v2-production-7e76.up.railway.app/user/tradeconfig"
             style="background:#1E3A5F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
            Get Started
          </a>
        </div>
      </div>`,
    });
  } catch (e) {
    console.error("Welcome email failed:", e);
  }
}
