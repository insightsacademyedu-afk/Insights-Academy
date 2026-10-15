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
    throw new Error(`Resend API rejected the email (${response.status}): ${details}`);
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
