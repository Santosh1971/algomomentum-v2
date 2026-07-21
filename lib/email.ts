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
          <img src="https://app.algomomentum.in/alm-logo.png" alt="AlgoMomentum" width="64" height="64" style="object-fit:contain;margin-bottom:8px" />
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
          <img src="https://app.algomomentum.in/alm-logo.png" alt="AlgoMomentum" width="64" height="64" style="object-fit:contain;margin-bottom:8px" />
          <h1 style="color:white;margin:0;font-size:24px">AlgoMomentum</h1>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:14px">Bridge Platform v2</p>
        </div>
        <h2 style="color:#1E3A5F">Welcome aboard, ${name}!</h2>
        <p style="color:#6b7280">Your account is now active. Connect your Delta Exchange API keys to start trading.</p>
        <div style="text-align:center;margin-top:24px">
          <a href="https://app.algomomentum.in/user/tradeconfig"
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

export async function sendPasswordResetEmail(email: string, name: string, resetUrl: string) {
  try {
    await resend.emails.send({
      from: FROM, to: email,
      subject: "Reset your AlgoMomentum password",
      html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px">
        <div style="background:#1E3A5F;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px">
          <img src="https://app.algomomentum.in/alm-logo.png" alt="AlgoMomentum" width="64" height="64" style="object-fit:contain;margin-bottom:8px" />
          <h1 style="color:white;margin:0;font-size:24px">AlgoMomentum</h1>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:14px">Bridge Platform v2</p>
        </div>
        <h2 style="color:#1E3A5F">Password Reset Request</h2>
        <p style="color:#6b7280">Hi ${name}, we received a request to reset your password. Click the button below to set a new password.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${resetUrl}" style="background:#1E3A5F;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">
            Reset Password
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center">This link expires in 1 hour. If you did not request this, ignore this email.</p>
        <p style="color:#9ca3af;font-size:12px;text-align:center;word-break:break-all">Or copy this link: ${resetUrl}</p>
      </div>`,
    });
    console.log("Password reset email sent to", email);
  } catch (e) {
    console.error("Password reset email failed:", e);
  }
}

export async function sendAdminNotification(adminEmail: string, userName: string, userEmail: string) {
  try {
    await resend.emails.send({
      from: FROM, to: adminEmail,
      subject: `✅ User Approved: ${userName}`,
      html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:32px">
        <div style="background:#1E3A5F;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px">
          <img src="https://app.algomomentum.in/alm-logo.png" alt="AlgoMomentum" width="64" height="64" style="object-fit:contain;margin-bottom:8px" />
          <h1 style="color:white;margin:0;font-size:24px">AlgoMomentum</h1>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:14px">Bridge Platform v2</p>
        </div>
        <h2 style="color:#1E3A5F">User Approved</h2>
        <p style="color:#6b7280"><strong>${userName}</strong> (${userEmail}) has been approved and their bots have been activated.</p>
        <a href="https://app.algomomentum.in/admin/users" style="display:inline-block;background:#1E3A5F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px">View Users →</a>
      </div>`,
    });
  } catch (e) {
    console.error("Admin notification email failed:", e);
  }
}

export async function sendNewUserAlert(adminEmail: string, userName: string, userEmail: string, deltaUserId?: string) {
  try {
    await resend.emails.send({
      from: FROM, to: adminEmail,
      subject: `🆕 New User Waiting Approval: ${userName}`,
      html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:32px">
        <div style="background:#1E3A5F;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px">
          <img src="https://app.algomomentum.in/alm-logo.png" alt="AlgoMomentum" width="64" height="64" style="object-fit:contain;margin-bottom:8px" />
          <h1 style="color:white;margin:0;font-size:24px">AlgoMomentum</h1>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:14px">Bridge Platform v2</p>
        </div>
        <h2 style="color:#F59E0B">New User Waiting for Approval</h2>
        <p style="color:#6b7280"><strong>${userName}</strong> (${userEmail}) has registered and is waiting for approval.</p>
        ${deltaUserId ? `<p style="color:#6b7280">Delta User ID: <strong>${deltaUserId}</strong></p>` : ""}
        <a href="https://app.algomomentum.in/admin/users" style="display:inline-block;background:#1E3A5F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px">Review User →</a>
      </div>`,
    });
  } catch (e) {
    console.error("New user alert email failed:", e);
  }
}

export async function sendDeltaConnectedEmail(email: string, name: string) {
  try {
    await resend.emails.send({
      from: FROM, to: email,
      subject: "✅ Delta Account Connected — Pending Admin Approval",
      html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:32px">
        <div style="background:#1E3A5F;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px">
          <img src="https://app.algomomentum.in/alm-logo.png" alt="AlgoMomentum" width="64" height="64" style="object-fit:contain;margin-bottom:8px" />
          <h1 style="color:white;margin:0;font-size:24px">AlgoMomentum</h1>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:14px">Bridge Platform v2</p>
        </div>
        <h2 style="color:#1E3A5F">Delta Account Connected! 🎉</h2>
        <p style="color:#6b7280">Hi ${name},</p>
        <p style="color:#6b7280">Your Delta Exchange account has been successfully connected to AlgoMomentum.</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#16a34a;margin:0;font-weight:600">⏳ Next Step: Admin Approval</p>
          <p style="color:#16a34a;margin:8px 0 0;font-size:14px">Our admin will verify your Delta account and approve your access shortly. You will receive another email once approved.</p>
        </div>
        <p style="color:#9ca3af;font-size:12px">If you have any questions, reply to this email.</p>
      </div>`,
    });
  } catch (e) {
    console.error("Delta connected email failed:", e);
  }
}

export async function sendDiscrepancyAlert(adminEmail: string, issues: string[]) {
  try {
    await resend.emails.send({
      from: FROM, to: adminEmail,
      subject: `⚠️ Account Discrepancy Alert — ${issues.length} issue${issues.length > 1 ? "s" : ""} found`,
      html: `<div style="font-family:Arial;max-width:520px;margin:0 auto;padding:32px">
        <div style="background:#1E3A5F;padding:24px;border-radius:8px;text-align:center;margin-bottom:24px">
          <img src="https://app.algomomentum.in/alm-logo.png" alt="AlgoMomentum" width="64" height="64" style="object-fit:contain;margin-bottom:8px" />
          <h1 style="color:white;margin:0;font-size:24px">AlgoMomentum</h1>
          <p style="color:#93c5fd;margin:4px 0 0;font-size:14px">Bridge Platform v2</p>
        </div>
        <h2 style="color:#DC2626">Account Discrepancy Alert</h2>
        <p style="color:#6b7280">The hourly check found ${issues.length} thing${issues.length > 1 ? "s" : ""} worth a look:</p>
        <ul style="color:#374151;padding-left:20px;line-height:1.6">
          ${issues.map(i => `<li style="margin-bottom:8px">${i}</li>`).join("")}
        </ul>
        <a href="https://app.algomomentum.in/admin/positions" style="display:inline-block;background:#1E3A5F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px">View Positions →</a>
      </div>`,
    });
  } catch (e) {
    console.error("Discrepancy alert email failed:", e);
  }
}

