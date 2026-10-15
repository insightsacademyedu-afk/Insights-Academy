import nodemailer from "nodemailer";
import { config } from "../config/env.js";

let transporter;

async function sendWithResend({ recipient, subject, text }) {
  if (!config.resend.from) throw new Error("RESEND_FROM is not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.resend.from,
      to: [recipient],
      subject,
      text,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    const error = new Error(`Resend API rejected the email (${response.status}): ${details}`);
    error.provider = "resend";
    error.status = response.status;
    throw error;
  }
}

function getTransporter() {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    throw new Error("SMTP is not configured");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

export async function sendPasswordResetCode({ recipient, code }) {
  return sendEmail({ recipient, subject: "Academy Management password reset code",
    text: `Your password reset code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.` });
}

export function emailIsConfigured() {
  return Boolean(config.resend.apiKey ? config.resend.from : config.smtp.host && config.smtp.user && config.smtp.pass);
}

// Store only known, actionable messages. Provider responses can contain private
// addresses or credentials and must not be copied into notification history.
export function notificationEmailFailure(error) {
  const details = String(error?.message || "").toLowerCase();
  if (error?.provider === "resend") {
    if (details.includes("only send testing emails") || details.includes("testing emails to your own")) {
      return "Resend's test sender can only email the Resend account owner. Verify your academy domain in Resend and set RESEND_FROM to an address on that domain.";
    }
    if (details.includes("domain") && (details.includes("not verified") || details.includes("verify"))) {
      return "The sender domain is not verified in Resend. Verify it and use an address on that domain for RESEND_FROM.";
    }
    if (error.status === 401 || error.status === 403) return "Resend rejected access. Check the API key, its sending permissions, and the verified sender domain.";
    if (error.status === 429) return "Resend rate or sending quota limit reached. Check your Resend usage and limits before sending again.";
    if (error.status >= 500) return "Resend is temporarily unavailable. Check its status before sending again.";
    return "Resend rejected the email. Check the recipient address and the email log in the Resend dashboard.";
  }
  if (error?.code === "EAUTH") return "SMTP authentication failed. Check the SMTP username and app password.";
  if (error?.name === "TimeoutError" || ["ETIMEDOUT", "ECONNECTION", "ESOCKET"].includes(error?.code)) return "The email service connection failed or timed out. Check your email settings and hosting network access.";
  return "Email delivery failed. Check your email provider logs and recipient address.";
}

export async function sendNotificationEmail({ recipient, title, message }) {
  return sendEmail({ recipient, subject: `Academy notification: ${title.replace(/[\r\n]/g, " ")}`,
    text: `${message}\n\nView your academy notifications: ${config.clientUrl}/notifications` });
}

async function sendEmail({ recipient, subject, text }) {
  if (config.resend.apiKey) return sendWithResend({ recipient, subject, text });

  const sender = config.smtp.from || config.smtp.user;
  await getTransporter().sendMail({
    from: sender,
    to: recipient,
    subject,
    text,
  });
}
