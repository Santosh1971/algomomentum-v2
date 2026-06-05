import nodemailer from "nodemailer";

// Simple email using Gmail SMTP or just log OTP in dev
export async function sendVerificationEmail(email: string, name: string, otp: string) {
  // If no SMTP configured, just log (for testing)
  if (!process.env.SMTP_USER) {
    console.log(`📧 OTP for ${email}: ${otp}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"AlgoMomentum" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Verify your AlgoMomentum account",
    html: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#1E3A5F">Welcome, ${name}!</h2>
      <p>Your verification code is:</p>
      <h1 style="font-size:48px;letter-spacing:8px;color:#1E3A5F;font-family:monospace">${otp}</h1>
      <p style="color:#999">Expires in 10 minutes.</p>
    </div>`,
  });
}

export async function sendWelcomeEmail(email: string, name: string) {
  console.log(`Welcome email would be sent to ${email}`);
}
