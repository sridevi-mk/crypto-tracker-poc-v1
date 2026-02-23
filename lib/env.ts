import { z } from "zod";

const appEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LLM_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("tinyllama"),
  ALERTS_CRON_SECRET: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  AUTH_USERNAME: z.string().optional(),
  AUTH_PASSWORD: z.string().optional(),
  RATE_LIMIT_CHAT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_ALERTS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_ALERTS_DISPATCH_PER_MINUTE: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_AUTH_SIGNIN_PER_MINUTE: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_AUTH_SIGNUP_PER_MINUTE: z.coerce.number().int().positive().default(5),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export function getAppEnv(): AppEnv {
  const parsed = appEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return parsed.data;
}

export function validateChatEnv(env: AppEnv) {
  if (env.LLM_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
    if (!env.OPENAI_MODEL) throw new Error("Missing OPENAI_MODEL");
  }
}

export function validateAlertsDispatchEnv(env: AppEnv) {
  if (!env.ALERTS_CRON_SECRET) {
    throw new Error("Missing ALERTS_CRON_SECRET");
  }
}
