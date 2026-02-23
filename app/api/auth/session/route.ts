import { cookies } from "next/headers";
import { getAuthCookieName, getAuthenticatedUsername } from "@/lib/auth";
import { apiOk } from "@/lib/api-response";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(getAuthCookieName())?.value;
  const username = await getAuthenticatedUsername(token);
  const isAuthenticated = Boolean(username);

  return apiOk({
    isAuthenticated,
    username: username || null,
  });
}
