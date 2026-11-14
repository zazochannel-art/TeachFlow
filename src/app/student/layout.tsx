import Link from "next/link";
import { GraduationCap, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui";
import { loadStudentPortal } from "@/lib/data/student";
import { studentSignOut } from "@/lib/actions/student";
import { StudentNav } from "./StudentNav";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getT } from "@/lib/i18n/server";

/** Student portal shell: full-screen like the teacher app, with a navy top navigation. */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const [portal, t] = await Promise.all([loadStudentPortal(), getT()]);
  const unread = portal.messages.filter(m => m.direction === "outgoing" && !m.read_at).length;

  return (
    <div className="flex min-h-dvh w-full flex-col bg-white">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-6 gap-y-3 bg-navy px-5 py-4 text-white md:px-8">
          <Link href="/student" className="flex items-center gap-2.5">
            <GraduationCap className="h-8 w-8 text-primary" fill="rgba(82,105,232,.3)" strokeWidth={1.8} />
            <span className="text-[17px] font-extrabold tracking-tight">TeachFlow</span>
          </Link>
          <StudentNav unread={unread} />
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher dark />
            <Avatar name={portal.name} size={34} />
            <span className="hidden text-[13px] font-bold sm:inline">{portal.name}</span>
            <form action={studentSignOut}>
              <button aria-label={t("Ieși din cont")} title={t("Ieși din cont")} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white/10 hover:bg-white/20"><LogOut className="h-4 w-4" /></button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">{children}</main>
    </div>
  );
}
