import type { Subscription } from "@/types/database";

export type PlanCode = Subscription["plan_code"];

export interface Plan {
  code: PlanCode;
  name: string;
  /** Monthly price in MDL; the yearly price is 10 months (two months free). */
  priceMonth: number;
  /** Active students allowed; null = unlimited. */
  studentLimit: number | null;
  /** Romanian source text, translated with t(). */
  blurb: string;
}

// Prices and limits are business settings: change them here.
export const PLANS: Plan[] = [
  { code: "free", name: "Free", priceMonth: 0, studentLimit: 5, blurb: "Pentru început: până la 5 elevi activi." },
  { code: "starter", name: "Starter", priceMonth: 149, studentLimit: 20, blurb: "Pentru profesorii cu câteva grupe." },
  { code: "pro", name: "Pro", priceMonth: 299, studentLimit: 60, blurb: "Pentru un program plin de lecții." },
  { code: "premium", name: "Premium", priceMonth: 499, studentLimit: null, blurb: "Elevi nelimitați." }
];

export const YEAR_MONTHS = 10;

export function planOf(code: PlanCode | null | undefined): Plan {
  return PLANS.find(p => p.code === code) ?? PLANS[0];
}

/** The plan that applies now: a paid plan only while it is active (or trialing) and not past its end date. */
export function effectivePlan(sub: Pick<Subscription, "plan_code" | "status" | "current_period_end"> | null, now = new Date()): Plan {
  if (!sub) return PLANS[0];
  const live = sub.status === "active" || sub.status === "trialing";
  const inPeriod = !sub.current_period_end || new Date(sub.current_period_end) > now;
  return live && inPeriod ? planOf(sub.plan_code) : PLANS[0];
}

/** True when one more active student would go over the plan's limit. */
export function overStudentLimit(plan: Plan, activeStudents: number) {
  return plan.studentLimit != null && activeStudents >= plan.studentLimit;
}
