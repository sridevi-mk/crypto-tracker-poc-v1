import { getAuthCookieName } from "@/lib/auth";
import { apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";

export async function POST() {
  const cookieName = getAuthCookieName();
  const secure = process.env.NODE_ENV === "production";
  const cookie = `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

  auditLog({
    event: "auth.signout",
    outcome: "success",
    resource: "session",
  });
  return apiOk({ ok: true }, 200, { "Set-Cookie": cookie });
}
