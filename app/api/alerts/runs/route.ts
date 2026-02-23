import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/api-response";
import { getAuthCookieName, getAuthenticatedUsername } from "@/lib/auth";
import { listRecentAlertRuns } from "@/lib/alerts-store";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

async function resolveUsername() {
  const jar = await cookies();
  const token = jar.get(getAuthCookieName())?.value;
  return await getAuthenticatedUsername(token);
}

export async function GET(req: Request) {
  const username = await resolveUsername();
  if (!username) {
    return apiError({
      status: 401,
      error: "unauthorized",
      message: "Authentication required.",
    });
  }

  const adminUser = process.env.AUTH_USERNAME || "admin";
  if (username !== adminUser) {
    return apiError({
      status: 403,
      error: "forbidden",
      message: "Admin access required.",
    });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get("limit") || undefined,
  });
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_query",
      message: "Invalid query parameters.",
      details: parsed.error.flatten(),
    });
  }

  const runs = await listRecentAlertRuns(parsed.data.limit);
  return apiOk({ runs, count: runs.length });
}

