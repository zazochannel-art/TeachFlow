import { Suspense } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar, type CurrentLessonChip } from "@/components/shell/TopBar";
import { loadWorkspace } from "@/lib/data/workspace";
import { badges, currentLesson, notifications } from "@/lib/data/derive";
import { dateKey, formatTime } from "@/lib/time";
import { getT } from "@/lib/i18n/server";

/**
 * App shell from the reference: pale lavender canvas, one large rounded white panel,
 * dark indigo rail on the left and the top bar spanning the main content.
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
    href: lesson.meeting_url ?? "/classroom",
    external: !!lesson.meeting_url
  } : null;
  const name = ws.profile?.full_name || ws.email?.split("@")[0] || t("Profesor");

  return (
    <div className="flex min-h-screen justify-center bg-canvas md:p-5 lg:p-7 xl:p-9">
      <div className="flex w-full max-w-[1440px] overflow-hidden bg-white shadow-[0_24px_60px_-20px_rgba(17,16,79,0.18)] md:min-h-[calc(100vh-40px)] md:rounded-[34px] lg:min-h-[calc(100vh-56px)] xl:min-h-[min(calc(100vh-72px),900px)]">
        <Sidebar badges={badges(ws)} admin={ws.isAdmin} />
        <div className="flex min-w-0 flex-1 flex-col px-4 pb-28 pt-5 md:px-8 md:pb-7 md:pt-7 xl:px-9">
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
    </div>
  );
}
