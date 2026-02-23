"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: Role;
  text: string;
}

interface ChatApiResponse {
  reply?: string;
  disclaimer?: string;
  error?: string;
  message?: string;
}

interface PageContextPayload {
  route: string;
  title: string;
  headings: string[];
  dataSourceHints: string[];
  timestamp: string;
}

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPageContext(): PageContextPayload {
  const headings = Array.from(document.querySelectorAll("h1, h2"))
    .map((el) => el.textContent?.trim() || "")
    .filter(Boolean)
    .slice(0, 8);
  const dataSourceHints = Array.from(document.querySelectorAll("p, div, span"))
    .map((el) => el.textContent?.trim() || "")
    .filter((txt) => txt.toLowerCase().includes("data source"))
    .slice(0, 8);
  return {
    route: window.location.pathname + window.location.search,
    title: document.title || "",
    headings,
    dataSourceHints,
    timestamp: new Date().toISOString(),
  };
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [usePageContext, setUsePageContext] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDisclaimer, setLastDisclaimer] = useState("Not financial advice.");
  const lastFailedInputRef = useRef<string | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  async function sendMessage(text: string) {
    setError(null);
    setIsSending(true);
    setMessages((prev) => [...prev, { id: messageId(), role: "user", text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          use_page_context: usePageContext,
          page_context: usePageContext ? getPageContext() : undefined,
        }),
      });
      const data = (await res.json()) as ChatApiResponse;
      if (!res.ok) throw new Error(data?.message || "Could not reach chat right now.");

      const reply = data.reply?.trim() || "I could not generate a response.";
      const disclaimer = data.disclaimer?.trim() || "Not financial advice.";
      setLastDisclaimer(disclaimer);
      setMessages((prev) => [...prev, { id: messageId(), role: "assistant", text: reply }]);
      lastFailedInputRef.current = null;
    } catch (err: any) {
      lastFailedInputRef.current = text;
      setError(err?.message || "Could not reach chat right now.");
    } finally {
      setIsSending(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    await sendMessage(text);
  }

  async function retryLast() {
    if (!lastFailedInputRef.current || isSending) return;
    await sendMessage(lastFailedInputRef.current);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-2xl border border-border bg-panel p-6 shadow-panel">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Tuffy AI Chat</h1>
        <p className="mt-2 text-sm text-mist">
          Ask for market explanations, comparisons, and page-aware summaries.
        </p>
        <p className="mt-1 text-xs text-mist">Data source: `/api/chat` (LLM provider from server env)</p>

        <div className="mt-4 rounded-lg border border-border bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={usePageContext}
              onChange={(e) => setUsePageContext(e.target.checked)}
            />
            Use page context
          </label>
          <p className="mt-1 text-xs text-mist">
            When enabled, Tuffy receives current route and visible page hints.
          </p>
        </div>

        <div className="mt-4 h-[360px] overflow-y-auto rounded-lg border border-border bg-white p-3">
          {messages.length === 0 ? (
            <div className="text-sm text-mist">
              Try: "Summarize what this page is showing in simple terms."
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="mb-3">
                <div className="mb-1 text-xs text-mist">{m.role === "user" ? "You" : "Tuffy"}</div>
                <div
                  className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-cyan-50" : "bg-slate-100"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}{" "}
            <button onClick={retryLast} disabled={isSending} className="ml-1 font-semibold underline disabled:opacity-60">
              Retry
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none ring-cyan-200 transition focus:ring-2"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>

        <p className="mt-3 text-xs text-mist">{lastDisclaimer}</p>
      </div>
    </main>
  );
}

