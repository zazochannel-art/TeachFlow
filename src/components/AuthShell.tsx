import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, GraduationCap, Users, Video } from "lucide-react";

/** Login / register frame in the same visual language as the app panel. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 md:p-8">
      <div className="flex w-full max-w-[920px] overflow-hidden rounded-[34px] bg-white shadow-[0_24px_60px_-20px_rgba(17,16,79,0.18)]">
        <aside className="hidden w-[340px] shrink-0 flex-col justify-between bg-navy p-9 text-white md:flex">
          <Link href="/" className="flex items-center gap-3">
            <GraduationCap className="h-9 w-9 text-primary" fill="rgba(82,105,232,.3)" strokeWidth={1.8} />
            <span className="text-[20px] font-extrabold tracking-tight">TeachFlow</span>
          </Link>
          <div className="space-y-3">
            {[[Users, "Elevi și grupe într-un singur loc"], [CalendarDays, "Orar clar pentru fiecare zi"], [Video, "Lecții online dintr-un clic"]].map(([Icon, text], i) => {
              const I = Icon as typeof Users;
              return (
                <div key={i} className={`flex items-center gap-3 rounded-[18px] px-4 py-3 text-[12px] font-semibold ${i === 2 ? "bg-primary" : "bg-white/5"}`}>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15"><I className="h-4 w-4" /></span>{text as string}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-white/60">Platforma pentru profesori independenți.</p>
        </aside>
        <div className="flex-1 p-8 md:p-12">{children}</div>
      </div>
    </main>
  );
}
