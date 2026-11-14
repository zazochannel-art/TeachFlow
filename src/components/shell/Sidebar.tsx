"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import {
  BookOpen, CalendarDays, ClipboardList, GraduationCap, LayoutGrid,
  MessageCircle, Settings, ShieldCheck, Users, Video, Wallet
} from "lucide-react";

export const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { label: "Elevi", href: "/students", icon: Users },
  { label: "Cursuri", href: "/courses", icon: BookOpen },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Lecții online", href: "/classroom", icon: Video },
  { label: "Teme", href: "/homework", icon: ClipboardList },
  { label: "Mesaje", href: "/messages", icon: MessageCircle },
  { label: "Finanțe", href: "/payments", icon: Wallet },
  { label: "Setări", href: "/settings", icon: Settings }
] as const;

/** Narrow dark-indigo rail with icon + label items and a tab-shaped active highlight. */
export function Sidebar({ badges = {}, admin = false }: { badges?: Record<string, number>; admin?: boolean }) {
  const pathname = usePathname();
  const t = useT();
  const items = admin ? [...navItems, { label: "Admin", href: "/admin", icon: ShieldCheck } as const] : navItems;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Desktop / tablet rail */}
      <aside className="hidden w-[92px] shrink-0 flex-col items-center bg-navy py-7 text-white md:flex md:rounded-l-[30px]">
        <Link href="/dashboard" aria-label="TeachFlow" className="mb-8 text-primary">
          <GraduationCap className="h-9 w-9" fill="rgba(82,105,232,.3)" strokeWidth={1.8} />
        </Link>
        <nav className="flex w-full flex-1 flex-col items-center gap-1.5 pl-2">
          {items.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center justify-center gap-1.5 py-3 transition-colors ${
                  active ? "rounded-l-[24px] bg-primary text-white shadow-md" : "text-white/75 hover:text-white"
                }`}
              >
                <span className="relative">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                  {badges[href] > 0 && <span className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-extrabold text-white ring-2 ring-navy">{badges[href]}</span>}
                </span>
                <span className="px-1 text-center text-[10px] font-semibold leading-tight tracking-tight">{t(label)}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="tf-scroll fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto bg-navy px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 text-white md:hidden">
        {items.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={`flex min-w-[68px] flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 ${active ? "bg-primary" : "text-white/75"}`}>
              <span className="relative">
                <Icon className="h-[18px] w-[18px]" />
                {badges[href] > 0 && <span className="absolute -right-2 -top-1.5 h-2.5 w-2.5 rounded-full bg-[#8fa0ff] ring-2 ring-navy" />}
              </span>
              <span className="whitespace-nowrap text-[9px] font-semibold">{t(label)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
