"use client";

interface DataSourceNoteProps {
  text?: string;
  source?: string;
  lastUpdated?: string;
  stale?: boolean;
  cache?: string;
  className?: string;
}

function formatDateTime(input?: string) {
  if (!input) return null;
  const ts = Date.parse(input);
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toLocaleString();
}

export function DataSourceNote({ text, source, lastUpdated, stale, cache, className }: DataSourceNoteProps) {
  const sourceLabel = source || text || "Unknown";
  const formatted = formatDateTime(lastUpdated);
  return (
    <p className={`text-xs text-mist ${className || ""}`.trim()}>
      Data source: {sourceLabel}
      {formatted ? ` • Last updated: ${formatted}` : ""}
      {cache ? ` • Cache: ${cache}` : ""}
      {stale ? " • Using stale cached data" : ""}
    </p>
  );
}
