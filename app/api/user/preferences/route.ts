import { z } from "zod";
import { cookies } from "next/headers";
import { getAuthCookieName, getAuthenticatedUsername } from "@/lib/auth";
import { getUserPreferences, saveUserPreferences } from "@/lib/user-store";
import { apiError, apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";

const preferencesSchema = z.object({
  selectedCurrency: z.string().trim().min(3).max(10).optional(),
  watchlist: z.array(z.string().trim().min(1).max(30)).max(100).optional(),
});

async function resolveUsername() {
  const jar = await cookies();
  const token = jar.get(getAuthCookieName())?.value;
  return await getAuthenticatedUsername(token);
}

export async function GET() {
  const username = await resolveUsername();
  if (!username) {
    return apiError({
      status: 401,
      error: "unauthorized",
      message: "Authentication required.",
    });
  }

  const preferences = await getUserPreferences(username);
  return apiOk({
    selected_currency: preferences.selectedCurrency,
    watchlist: preferences.watchlist,
    updated_at: preferences.updatedAt,
  });
}

export async function PUT(req: Request) {
  const username = await resolveUsername();
  if (!username) {
    return apiError({
      status: 401,
      error: "unauthorized",
      message: "Authentication required.",
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

  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid payload.",
      details: parsed.error.flatten(),
    });
  }

  const normalizedWatchlist = parsed.data.watchlist?.map((s) => s.toUpperCase().trim());
  const selectedCurrency = parsed.data.selectedCurrency?.toUpperCase().trim();

  const saved = await saveUserPreferences(username, {
    selectedCurrency,
    watchlist: normalizedWatchlist,
  });

  auditLog({
    event: "preferences.update",
    actor: username,
    outcome: "success",
    resource: "preferences",
  });
  return apiOk({
    selected_currency: saved.selectedCurrency,
    watchlist: saved.watchlist,
    updated_at: saved.updatedAt,
  });
}
