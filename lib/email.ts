import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, name: string, otp: string) {
  await resend.emails.send({
    from: "AlgoMomentum <noreply@algomomentum.in>",
    to: email,
    subject: "Verify your AlgoMomentum account",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px;">
        <div style="background: #1E3A5F; padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 24px;">AlgoMomentum</h1>
          <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 14px;">Bridge Platform v2</p>
        </div>
        <h2 style="color: #1E3A5F; margin-bottom: 8px;">Welcome, ${name}!</h2>
        <p style="color: #6b7280; margin-bottom: 24px;">Use the OTP below to verify your email address. It expires in 10 minutes.</p>
        <div style="background: white; border: 2px solid #1E3A5F; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="margin: 0; color: #6b7280; font-size: 14px; margin-bottom: 8px;">Your verification code</p>
          <h1 style="margin: 0; color: #1E3A5F; font-size: 48px; letter-spacing: 8px; font-family: monospace;">${otp}</h1>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">If you did not create an account, please ignore this email.</p>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(email: string, name: string) {
  await resend.emails.send({
    from: "AlgoMomentum <noreply@algomomentum.in>",
    to: email,
    subject: "Welcome to AlgoMomentum Bridge!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px;">
        <div style="background: #1E3A5F; padding: 24px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: white; margin: 0; font-size: 24px;">AlgoMomentum</h1>
          <p style="color: #93c5fd; margin: 4px 0 0 0; font-size: 14px;">Bridge Platform v2</p>
        </div>
        <h2 style="color: #1E3A5F;">Welcome aboard, ${name}! 🎉</h2>
        <p style="color: #6b7280;">Your account is verified and ready. Here is what you can do next:</p>
        <ul style="color: #374151; line-height: 2;">
          <li>Connect your Delta Exchange API keys</li>
          <li>Add symbols to trade</li>
          <li>Copy your webhook URL to TradingView</li>
          <li>Start automated trading!</li>
        </ul>
        <div style="text-align: center; margin-top: 24px;">
          <a href="https://algomomentum-v2-production-7e76.up.railway.app/user/tradeconfig" 
             style="background: #1E3A5F; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Get Started →
          </a>
        </div>
      </div>
    `,
  });
}
