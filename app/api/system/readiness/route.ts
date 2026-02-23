import { apiError, apiOk } from "@/lib/api-response";
import { logger } from "@/lib/logger";

async function checkDatabase(): Promise<{ ok: boolean; mode: "postgres" | "file"; detail?: string }> {
  const databaseUrl = process.env.DATABASE_URL;
  const userStoreBackend = process.env.USER_STORE_BACKEND || "";
  const alertsStoreBackend = process.env.ALERTS_STORE_BACKEND || "";
  const forcingFile =
    userStoreBackend.toLowerCase() === "file" || alertsStoreBackend.toLowerCase() === "file";

  if (!databaseUrl || forcingFile) {
    return {
      ok: true,
      mode: "file",
      detail: !databaseUrl ? "DATABASE_URL not set (file fallback mode)." : "File store forced by env.",
    };
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRawUnsafe("SELECT 1");
    return { ok: true, mode: "postgres" };
  } catch (err) {
    return {
      ok: false,
      mode: "postgres",
      detail: err instanceof Error ? err.message : "Database ping failed",
    };
  }
}

export async function GET() {
  try {
    const authSecretOk = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
    const alertsSecretOk = Boolean(process.env.ALERTS_CRON_SECRET);
    const llmProvider = process.env.LLM_PROVIDER || "openai";
    const chatProviderOk =
      llmProvider === "ollama"
        ? Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL)
        : Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
    const db = await checkDatabase();

    const checks = {
      auth_secret: { ok: authSecretOk },
      alerts_cron_secret: { ok: alertsSecretOk },
      chat_provider: { ok: chatProviderOk, provider: llmProvider },
      database: db,
    };

    const ok = authSecretOk && alertsSecretOk && chatProviderOk && db.ok;
    const status = ok ? 200 : 503;

    return apiOk(
      {
        ok,
        checks,
        checked_at: new Date().toISOString(),
      },
      status
    );
  } catch (err) {
    logger.error("system.readiness.failed", err);
    return apiError({
      status: 500,
      error: "readiness_check_failed",
      message: err instanceof Error ? err.message : "Readiness check failed",
    });
  }
}

