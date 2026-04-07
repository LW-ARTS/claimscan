/**
 * /terms skeleton — matches the legal document layout with sidebar
 * on lg+ and numbered sections on mobile.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading terms" className="animate-pulse">
      {/* Header */}
      <header className="px-5 pt-20 pb-12 text-center sm:px-12 lg:px-[200px]">
        <div className="mx-auto h-4 w-16 rounded-full bg-white/5" />
        <div className="mx-auto mt-6 h-8 w-4/5 max-w-xl rounded-[8px] bg-white/5 sm:h-12" />
        <div className="mx-auto mt-4 h-5 w-2/3 max-w-md rounded-[6px] bg-white/5" />
        <div className="mx-auto mt-4 h-3 w-48 rounded bg-white/5" />
      </header>

      {/* Two-column layout */}
      <div className="flex w-full px-5 pb-24 sm:px-12">
        {/* Sidebar — desktop only */}
        <aside className="hidden w-[240px] shrink-0 border-r border-[var(--border-subtle)] pr-3 lg:block">
          <div className="sticky top-20 space-y-1.5 py-4">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-6 w-full rounded-[6px] bg-white/[0.03]" />
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 space-y-8 lg:pl-12">
          {/* Entity block */}
          <div className="h-20 w-full rounded-xl bg-white/[0.03]" />

          {/* Numbered sections */}
          {[0, 1, 2, 3].map((section) => (
            <section key={section} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-6 w-10 rounded-[4px] bg-white/5" />
                <div className="h-6 w-64 max-w-full rounded-[6px] bg-white/5" />
              </div>
              <div className="space-y-2 pl-0 sm:pl-[52px]">
                <div className="h-3 w-full rounded bg-white/[0.03]" />
                <div className="h-3 w-[96%] rounded bg-white/[0.03]" />
                <div className="h-3 w-[92%] rounded bg-white/[0.03]" />
                <div className="h-3 w-[80%] rounded bg-white/[0.03]" />
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
