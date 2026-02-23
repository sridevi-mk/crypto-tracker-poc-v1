import { z } from "zod";
import { cookies } from "next/headers";
import { getAuthCookieName, getAuthenticatedUsername } from "@/lib/auth";
import { addUserWatchlistSymbol, getUserWatchlist, removeUserWatchlistSymbol } from "@/lib/user-store";
import { apiError, apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";

const payloadSchema = z.object({
  symbol: z.string().trim().min(1).max(20).regex(/^[a-zA-Z0-9._-]+$/, "Invalid symbol format"),
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

  const watchlist = await getUserWatchlist(username);
  return apiOk({ watchlist });
}

export async function POST(req: Request) {
  const username = await resolveUsername();
  if (!username) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
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

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid payload.",
      details: parsed.error.flatten(),
    });
  }

  const watchlist = await addUserWatchlistSymbol(username, parsed.data.symbol);
  auditLog({
    event: "watchlist.add",
    actor: username,
    outcome: "success",
    resource: "watchlist",
    metadata: { symbol: parsed.data.symbol.toUpperCase() },
  });
  return apiOk({ watchlist });
}

export async function DELETE(req: Request) {
  const username = await resolveUsername();
  if (!username) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
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

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid payload.",
      details: parsed.error.flatten(),
    });
  }

  const watchlist = await removeUserWatchlistSymbol(username, parsed.data.symbol);
  auditLog({
    event: "watchlist.remove",
    actor: username,
    outcome: "success",
    resource: "watchlist",
    metadata: { symbol: parsed.data.symbol.toUpperCase() },
  });
  return apiOk({ watchlist });
}
