import { z } from "zod";
import { cookies } from "next/headers";
import { getAuthCookieName, getAuthenticatedUsername } from "@/lib/auth";
import { addUserWallet, getUserWallets, removeUserWallet } from "@/lib/user-store";
import { apiError, apiOk } from "@/lib/api-response";
import { auditLog } from "@/lib/audit";

const walletPayloadSchema = z.object({
  address: z
    .string()
    .trim()
    .refine((v) => v.startsWith("0x"), { message: "Address must start with 0x" })
    .refine((v) => v.length === 42, { message: "Address must be 42 characters long" }),
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

  const wallets = await getUserWallets(username);
  return apiOk({ wallets });
}

export async function POST(req: Request) {
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

  const parsed = walletPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid payload.",
      details: parsed.error.flatten(),
    });
  }

  const wallets = await addUserWallet(username, parsed.data.address);
  auditLog({
    event: "wallet.add",
    actor: username,
    outcome: "success",
    resource: "wallet",
    metadata: { address: parsed.data.address },
  });
  return apiOk({ wallets });
}

export async function DELETE(req: Request) {
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

  const parsed = walletPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({
      status: 400,
      error: "invalid_payload",
      message: "Invalid payload.",
      details: parsed.error.flatten(),
    });
  }

  const wallets = await removeUserWallet(username, parsed.data.address);
  auditLog({
    event: "wallet.remove",
    actor: username,
    outcome: "success",
    resource: "wallet",
    metadata: { address: parsed.data.address },
  });
  return apiOk({ wallets });
}
