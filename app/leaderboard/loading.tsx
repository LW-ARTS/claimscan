/**
 * /leaderboard skeleton — mimics the leaderboard header + ranking list
 * so the transition into the real data feels seamless.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading leaderboard"
      className="mx-auto w-full max-w-[1200px] animate-pulse px-5 pt-16 pb-24 sm:px-12"
    >
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto h-4 w-24 rounded-full bg-white/5" />
        <div className="mx-auto mt-6 h-8 w-72 max-w-full rounded-[8px] bg-white/5 sm:h-12" />
        <div className="mx-auto mt-4 h-5 w-2/3 max-w-md rounded-[6px] bg-white/5" />
      </div>

      {/* Filter row */}
      <div className="mt-10 flex items-center justify-center gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-20 shrink-0 rounded-[20px] bg-white/5" />
        ))}
      </div>

      {/* Leaderboard list */}
      <div className="mt-8 space-y-2">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
          >
            <div className="h-4 w-5 shrink-0 rounded bg-white/5" />
            <div className="h-7 w-7 shrink-0 rounded-full bg-white/5" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-32 max-w-[60%] rounded bg-white/5" />
              <div className="h-3 w-24 max-w-[40%] rounded bg-white/[0.03]" />
            </div>
            <div className="h-5 w-16 shrink-0 rounded bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
