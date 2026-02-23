import { z } from "zod";
import { createSessionToken, getAuthCookieName, isAuthConfigured } from "@/lib/auth";
import { validateCredentials } from "@/lib/auth-credentials";
import { apiError, apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { checkRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { getAppEnv } from "@/lib/env";

const signInSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Invalid username format"),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const env = getAppEnv();
  const clientKey = getRequestClientKey(req);
  const rl = checkRateLimit({
    bucket: "auth_signin",
    key: clientKey,
    limit: env.RATE_LIMIT_AUTH_SIGNIN_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    auditLog({
      event: "auth.signin.rate_limited",
      actor: "anonymous",
      outcome: "failure",
      resource: "session",
      metadata: { clientKey },
    });
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many sign-in attempts. Please retry shortly.",
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  if (!isAuthConfigured()) {
    return apiError({
      status: 500,
      error: "auth_config_error",
      message: "Set AUTH_SECRET in environment variables.",
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError({
      status: 400,
      error: "invalid_json",
      message: "Body must be valid JSON.",
    });
  }

  const parsed = signInSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid credentials payload.",
      details: parsed.error.flatten(),
    });
  }

  const { username, password } = parsed.data;
  if (!(await validateCredentials(username, password))) {
    auditLog({
      event: "auth.signin",
      actor: username,
      outcome: "failure",
      resource: "session",
    });
    return apiError({
      status: 401,
      error: "invalid_credentials",
      message: "Invalid username or password.",
    });
  }

  const token = await createSessionToken(username);
  if (!token) {
    return apiError({
      status: 500,
      error: "session_creation_failed",
      message: "Unable to create session token.",
    });
  }

  const cookieName = getAuthCookieName();
  const secure = process.env.NODE_ENV === "production";
  const cookie = `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? "; Secure" : ""}`;

  auditLog({
    event: "auth.signin",
    actor: username,
    outcome: "success",
    resource: "session",
  });
  return apiOk({ ok: true }, 200, { "Set-Cookie": cookie });
}
