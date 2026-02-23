type EmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export type EmailDeliveryResult = {
  ok: boolean;
  provider: "resend" | "log";
  message: string;
};

async function sendViaResend(payload: EmailPayload): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.ALERTS_EMAIL_FROM || "alerts@cryptotracker.local";
  if (!apiKey) {
    return { ok: false, provider: "resend", message: "Missing RESEND_API_KEY" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      provider: "resend",
      message: `Resend failed (${res.status}): ${text.slice(0, 120)}`,
    };
  }

  return { ok: true, provider: "resend", message: "Email sent with Resend" };
}

async function sendViaLog(payload: EmailPayload): Promise<EmailDeliveryResult> {
  console.log("[alerts-email-log]", payload);
  return { ok: true, provider: "log", message: "Logged email payload" };
}

export async function sendAlertEmail(payload: EmailPayload): Promise<EmailDeliveryResult> {
  const provider = (process.env.ALERTS_EMAIL_PROVIDER || "log").toLowerCase();
  if (provider === "resend") return sendViaResend(payload);
  return sendViaLog(payload);
}

export function resolveAlertRecipient(username: string): string | null {
  const envRecipient = process.env.ALERT_NOTIFICATION_EMAIL || "";
  if (envRecipient) return envRecipient;
  if (username.includes("@")) return username;
  return null;
}
