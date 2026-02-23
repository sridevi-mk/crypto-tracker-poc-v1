import { dispatchAlertsNow } from "@/lib/alerts-dispatch";

function toWindowKey(ts: Date) {
  const y = ts.getUTCFullYear();
  const m = String(ts.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ts.getUTCDate()).padStart(2, "0");
  const h = String(ts.getUTCHours()).padStart(2, "0");
  const min = String(ts.getUTCMinutes()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}`;
}

export function defaultAlertRunKey() {
  return `alerts-${toWindowKey(new Date())}`;
}

export async function runAlertsWorker(runKey?: string) {
  const key = runKey || defaultAlertRunKey();
  return dispatchAlertsNow(key);
}
