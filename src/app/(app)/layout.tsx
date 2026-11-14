import { Suspense } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar, type CurrentLessonChip } from "@/components/shell/TopBar";
import { loadWorkspace } from "@/lib/data/workspace";
import { badges, currentLesson, notifications } from "@/lib/data/derive";
import { dateKey, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

/**
 * Full-screen app shell: dark indigo rail pinned to the left edge, white workspace filling
 * the rest of the viewport, top bar spanning the main content.
 * The layout stays mounted between pages (only the page segment re-renders), and
 * loading.tsx next to it shows a skeleton instantly while the next page loads.
 * The auth/role guard runs inside loadWorkspace() for every page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [ws, t] = await Promise.all([loadWorkspace(), getT()]);
  const now = new Date();
  const lesson = currentLesson(ws, now);
  const current: CurrentLessonChip | null = lesson ? {
    title: lesson.title,
    time: formatTime(lesson.starts_at, ws.timezone, t.locale),
    running: new Date(lesson.starts_at) <= now,
    href: `/classroom/${lesson.id}`,
    external: false
  } : null;
  const name = ws.profile?.full_name || ws.email?.split("@")[0] || t("Profesor");

  return (
    <div className="flex min-h-dvh w-full bg-white">
      <Sidebar badges={badges(ws)} admin={ws.isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-5 md:px-8 md:pb-7 md:pt-7 xl:px-10 2xl:px-12">
        <Suspense fallback={<div className="mb-7 h-[54px]" />}>
          <TopBar
            todayKey={dateKey(now, ws.timezone)}
            name={name}
            avatarUrl={ws.profile?.avatar_url ?? null}
            current={current}
            unread={notifications(ws, now, t).length}
          />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
