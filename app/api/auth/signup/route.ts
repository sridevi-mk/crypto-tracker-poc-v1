import { z } from "zod";
import { createSessionToken, getAuthCookieName, isAuthConfigured } from "@/lib/auth";
import { createUserWithPassword, userExists } from "@/lib/user-store";
import { hashPassword } from "@/lib/password";
import { apiError, apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";
import { checkRateLimit, getRequestClientKey } from "@/lib/rate-limit";
import { getAppEnv } from "@/lib/env";

const signUpSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username can contain letters, numbers, _, -, ."),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const env = getAppEnv();
  const clientKey = getRequestClientKey(req);
  const rl = checkRateLimit({
    bucket: "auth_signup",
    key: clientKey,
    limit: env.RATE_LIMIT_AUTH_SIGNUP_PER_MINUTE,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    auditLog({
      event: "auth.signup.rate_limited",
      actor: "anonymous",
      outcome: "failure",
      resource: "user",
      metadata: { clientKey },
    });
    return apiError({
      status: 429,
      error: "rate_limited",
      message: "Too many sign-up attempts. Please retry shortly.",
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

  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid signup payload.",
      details: parsed.error.flatten(),
    });
  }

  const username = parsed.data.username.trim();
  const password = parsed.data.password;
  const envAuthUser = process.env.AUTH_USERNAME || "admin";
  const envAuthPass = process.env.AUTH_PASSWORD || "";
  if (envAuthPass && username === envAuthUser) {
    return apiError({
      status: 409,
      error: "username_reserved",
      message: "Username reserved by system admin auth.",
    });
  }

  if (await userExists(username)) {
    return apiError({
      status: 409,
      error: "username_exists",
      message: "Username already exists.",
    });
  }

  const { hash, salt } = await hashPassword(password);
  const user = await createUserWithPassword(username, hash, salt);
  if (!user) {
    auditLog({
      event: "auth.signup",
      actor: username,
      outcome: "failure",
      resource: "user",
    });
    return apiError({
      status: 502,
      error: "user_creation_failed",
      message: "Unable to create user.",
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
    event: "auth.signup",
    actor: username,
    outcome: "success",
    resource: "user",
  });
  return apiOk({ ok: true, username }, 201, { "Set-Cookie": cookie });
}
