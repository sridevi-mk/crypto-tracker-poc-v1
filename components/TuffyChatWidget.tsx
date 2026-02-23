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

export function TuffyChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [usePageContext, setUsePageContext] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFailedInputRef = useRef<string | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  function getPageContext(): PageContextPayload {
    const headings = Array.from(document.querySelectorAll("h1, h2"))
      .map((el) => el.textContent?.trim() || "")
      .filter(Boolean)
      .slice(0, 6);
    const dataSourceHints = Array.from(document.querySelectorAll("p, div, span"))
      .map((el) => el.textContent?.trim() || "")
      .filter((txt) => txt.toLowerCase().includes("data source"))
      .slice(0, 4);
    return {
      route: window.location.pathname + window.location.search,
      title: document.title || "",
      headings,
      dataSourceHints,
      timestamp: new Date().toISOString(),
    };
  }

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
      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text();
      let data: ChatApiResponse | null = null;
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(raw) as ChatApiResponse;
        } catch {
          data = null;
        }
      }
      if (!res.ok) {
        throw new Error(
          data?.message ||
            (contentType.includes("text/html")
              ? `Chat endpoint returned HTML (${res.status}).`
              : `Could not reach chat right now (${res.status}).`)
        );
      }

      const reply = data?.reply?.trim() || "I could not generate a response.";
      const disclaimer = data?.disclaimer?.trim();
      const finalText = disclaimer ? `${reply}\n\n${disclaimer}` : reply;

      setMessages((prev) => [...prev, { id: messageId(), role: "assistant", text: finalText }]);
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
    <div
      className={`fixed bottom-4 right-4 z-[1000] ${open ? "w-[340px]" : "w-auto"}`}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800"
        >
          Chat with Tuffy
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-panel">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <strong className="text-sm text-ink">Tuffy AI</strong>
            <button onClick={() => setOpen(false)} className="text-xs font-medium text-mist hover:text-ink">Close</button>
          </div>

          <div className="border-b border-border px-3 py-2">
            <label className="flex items-center gap-2 text-xs text-mist">
              <input
                type="checkbox"
                checked={usePageContext}
                onChange={(e) => setUsePageContext(e.target.checked)}
              />
              Use page context
            </label>
          </div>

          <div className="max-h-[260px] overflow-y-auto p-3">
            {messages.length === 0 ? (
              <div className="text-xs text-mist">Ask about markets, coins, or your portfolio.</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="mb-2.5">
                  <div className="mb-1 text-[11px] text-mist">
                    {m.role === "user" ? "You" : "Tuffy"}
                  </div>
                  <div className={`whitespace-pre-wrap rounded-lg px-2.5 py-2 text-sm ${m.role === "user" ? "bg-cyan-50" : "bg-slate-100"}`}>
                    {m.text}
                  </div>
                </div>
              ))
            )}
          </div>

          {error && (
            <div className="px-3 pb-2 text-xs text-rose-700">
              {error}{" "}
              <button onClick={retryLast} disabled={isSending} className="ml-1 font-semibold underline disabled:opacity-60">
                Retry
              </button>
            </div>
          )}

          <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none ring-cyan-200 transition focus:ring-2"
              disabled={isSending}
            />
            <button type="submit" disabled={!canSend} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
              {isSending ? "..." : "Send"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
