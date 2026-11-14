/**
 * Instant placeholder shown by loading.tsx while the next page renders on the server.
 * With it, a click in the menu switches the view immediately and the persistent shell
 * (rail + top bar) never disappears.
 */
export function PageSkeleton({ label = "Se încarcă…" }: { label?: string }) {
  const bar = "animate-pulse rounded-[14px] bg-[#eef0fb]";
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-1 flex-col gap-5">
      <span className="sr-only">{label}</span>
      <div className={`${bar} h-8 w-56`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(i => <div key={i} className={`${bar} h-24`} />)}
      </div>
      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className={`${bar} min-h-[320px]`} />
        <div className={`${bar} min-h-[320px]`} />
      </div>
    </div>
  );
}
