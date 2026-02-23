"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-3xl px-4 py-12">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <h1 className="text-2xl font-bold text-rose-800">Application Error</h1>
            <p className="mt-2 text-sm text-rose-700">
              {error?.message || "Unexpected root error."}
            </p>
            <button
              onClick={() => reset()}
              className="mt-4 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
