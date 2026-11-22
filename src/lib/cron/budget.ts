/**
 * Time budget of one cron run. A run stops *starting* new work once the budget is spent and says
 * how much it left for later (`deferred`); the next scheduled run of the same job (vercel.json)
 * picks it up, because every job logs what it already sent (reminder_log, parent_report_log,
 * lesson_push_log) and skips it.
 */
export function timeBudget(seconds: number, clock: () => number = Date.now) {
  const end = clock() + seconds * 1000;
  return {
    /** True once the run should stop starting new work. */
    spent: () => clock() >= end,
    leftMs: () => Math.max(0, end - clock())
  };
}

/** Seconds a run may spend on work out of its `maxDuration`, keeping a margin to answer in time. */
export const workSeconds = (maxDuration: number) => Math.max(10, maxDuration - 40);
