import { z } from "zod";
import { runBacktest } from "@/lib/backtest";

const requestSchema = z.object({
  symbol_or_id: z.string().trim().min(1).max(50),
  strategy: z.enum(["dca_weekly", "buy_dip"]),
  days: z.number().int().min(30).max(365).default(180),
  weekly_amount_usd: z.number().positive().max(10_000).optional(),
  dip_threshold_pct: z.number().positive().max(30).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid payload", details: parsed.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const summary = await runBacktest({
      symbolOrId: parsed.data.symbol_or_id,
      strategy: parsed.data.strategy,
      days: parsed.data.days,
      weeklyAmountUsd: parsed.data.weekly_amount_usd,
      dipThresholdPct: parsed.data.dip_threshold_pct,
    });

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "Backtest failed", message: err?.message || "Unknown error" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
