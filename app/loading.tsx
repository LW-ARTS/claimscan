/**
 * Global loading skeleton — used as a fallback when a route has no
 * dedicated loading.tsx. Mimics the generic shape of a content page
 * (hero block + content blocks) with a subtle pulse so the transition
 * feels like something is loading instead of a bare spinner.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="mx-auto w-full max-w-[1200px] animate-pulse px-5 pt-20 pb-24 sm:px-12"
    >
      {/* Badge placeholder */}
      <div className="mx-auto h-6 w-40 rounded-full bg-white/5" />

      {/* Title placeholder */}
      <div className="mx-auto mt-6 h-8 w-3/4 max-w-lg rounded-[8px] bg-white/5 sm:h-12" />
      <div className="mx-auto mt-3 h-5 w-2/3 max-w-sm rounded-[6px] bg-white/5" />

      {/* Content blocks */}
      <div className="mt-12 space-y-4">
        <div className="h-32 w-full rounded-[14px] bg-white/[0.03]" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-40 rounded-[14px] bg-white/[0.03]" />
          <div className="h-40 rounded-[14px] bg-white/[0.03]" />
        </div>
        <div className="h-24 w-full rounded-[14px] bg-white/[0.03]" />
      </div>
    </div>
  );
}
