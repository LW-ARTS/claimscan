/**
 * /docs skeleton — matches the two-column layout (sidebar on lg+,
 * content on mobile) so the transition doesn't jump when the real
 * page hydrates.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading docs" className="animate-pulse">
      {/* Header */}
      <header className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-5 pt-20 pb-12 text-center sm:px-12">
        <div className="h-4 w-32 rounded-full bg-white/5" />
        <div className="h-8 w-3/4 max-w-lg rounded-[8px] bg-white/5 sm:h-12" />
        <div className="h-5 w-2/3 max-w-sm rounded-[6px] bg-white/5" />
      </header>

      {/* Two-column layout */}
      <div className="mx-auto flex w-full max-w-[1200px] px-5 pb-24 sm:px-12">
        {/* Sidebar — desktop only */}
        <aside className="hidden w-[220px] shrink-0 border-r border-[var(--border-subtle)] pr-3 lg:block">
          <div className="sticky top-20 space-y-5 py-4">
            {[0, 1, 2].map((g) => (
              <div key={g} className="space-y-1.5">
                <div className="mb-2 h-3 w-20 rounded bg-white/5" />
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-6 w-full rounded-[6px] bg-white/[0.03]" />
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 space-y-10 lg:pl-12">
          {[0, 1, 2].map((section) => (
            <section key={section} className="space-y-4">
              <div className="h-7 w-48 rounded-[6px] bg-white/5" />
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-white/[0.03]" />
                <div className="h-4 w-[95%] rounded bg-white/[0.03]" />
                <div className="h-4 w-[88%] rounded bg-white/[0.03]" />
              </div>
              <div className="h-32 w-full rounded-[10px] bg-white/[0.03]" />
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
