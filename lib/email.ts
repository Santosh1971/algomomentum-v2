// lib/email.ts
// Simple email logging — replace with actual SMTP when ready

export async function sendVerificationEmail(email: string, name: string, otp: string) {
  // Log OTP to console (check Railway deploy logs)
  console.log(`\n📧 ================================`);
  console.log(`📧 OTP for ${email}: ${otp}`);
  console.log(`📧 ================================\n`);
  
  // TODO: integrate SMTP/Resend after demo
}

export async function sendWelcomeEmail(email: string, name: string) {
  console.log(`📧 Welcome email for ${email} (${name})`);
}
