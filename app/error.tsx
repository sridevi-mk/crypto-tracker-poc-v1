"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h2 className="text-xl font-bold text-rose-800">Something went wrong</h2>
        <p className="mt-2 text-sm text-rose-700">
          {error?.message || "Unexpected application error."}
        </p>
        <button
          onClick={() => reset()}
          className="mt-4 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
