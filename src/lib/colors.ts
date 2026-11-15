import type { CSSProperties } from "react";

// Course colours. A course keeps the colour the teacher picked (migration 0011, courses.color);
// otherwise it gets one from the palette by its position, so colours stay stable over time.

export const COURSE_PALETTE = ["#5269e8", "#16a37b", "#f08c2e", "#d9488f", "#8b5cf6", "#0ea5c6", "#e5484d", "#1c1f6e"] as const;
export const NEUTRAL_COLOR = "#858ba8";

const HEX = /^#[0-9a-f]{6}$/;

export function isCourseColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

/** Map of course id → colour for a list of courses (in creation order). */
export function courseColors(courses: Array<{ id: string; color?: string | null; created_at?: string }>): Map<string, string> {
  const ordered = [...courses].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id));
  return new Map(ordered.map((c, i) => [c.id, isCourseColor(c.color) ? c.color : COURSE_PALETTE[i % COURSE_PALETTE.length]]));
}

/** Inline style that exposes the colour to the .tf-c-* helper classes (globals.css). */
export const colorVar = (color: string | null | undefined) => ({ "--c": color ?? NEUTRAL_COLOR }) as CSSProperties;
