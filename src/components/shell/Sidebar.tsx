"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  BookOpen, CalendarDays, ClipboardList, GraduationCap, LayoutGrid, Library, Sparkles,
  Menu, MessageCircle, Settings, X, ShieldCheck, Users, Video, Wallet
} from "lucide-react";

export const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { label: "Elevi", href: "/students", icon: Users },
  { label: "Cursuri", href: "/courses", icon: BookOpen },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Lecții online", href: "/classroom", icon: Video },
  { label: "Teme", href: "/homework", icon: ClipboardList },
  { label: "Teste AI", href: "/quizzes", icon: Sparkles },
  { label: "Bibliotecă", href: "/library", icon: Library },
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
      <aside className="sticky top-0 hidden h-dvh w-[92px] shrink-0 flex-col items-center overflow-y-auto [scrollbar-width:none] bg-navy py-7 text-white md:flex">
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

      {/* Mobile bottom bar: the four most used pages + "Mai mult" for the rest (no sideways scrolling). */}
      <MobileNav items={items} badges={badges} isActive={isActive} />
    </>
  );
}

type NavItem = { label: string; href: string; icon: typeof LayoutGrid };
const MOBILE_PRIMARY = ["/dashboard", "/calendar", "/students", "/messages"];

function MobileNav({ items, badges, isActive }: { items: readonly NavItem[]; badges: Record<string, number>; isActive: (href: string) => boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const primary = MOBILE_PRIMARY.map(h => items.find(i => i.href === h)).filter(Boolean) as NavItem[];
  const rest = items.filter(i => !MOBILE_PRIMARY.includes(i.href));
  const restActive = rest.some(i => isActive(i.href));
  const restBadge = rest.some(i => badges[i.href] > 0);

  const tab = (active: boolean) => `flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 ${active ? "bg-primary text-white" : "text-white/75"}`;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-navy/40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] rounded-[24px] bg-white p-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {rest.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}
                    className={`relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center ${active ? "bg-primary text-white" : "bg-soft text-ink"}`}>
                    <Icon className="h-5 w-5" />
                    <span className="text-[11px] font-bold leading-tight">{t(label)}</span>
                    {badges[href] > 0 && <span className="absolute right-2 top-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-extrabold text-white ring-2 ring-white">{badges[href]}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex gap-1 bg-navy px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 text-white md:hidden">
        {primary.map(({ label, href, icon: Icon }) => {
          const active = isActive(href) && !open;
          return (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={tab(active)}>
              <span className="relative">
                <Icon className="h-5 w-5" />
                {badges[href] > 0 && <span className="absolute -right-2 -top-1.5 h-2.5 w-2.5 rounded-full bg-[#8fa0ff] ring-2 ring-navy" />}
              </span>
              <span className="whitespace-nowrap text-[10px] font-semibold">{t(label)}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className={`${tab(open || restActive)} cursor-pointer`}>
          <span className="relative">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            {restBadge && !open && <span className="absolute -right-2 -top-1.5 h-2.5 w-2.5 rounded-full bg-[#8fa0ff] ring-2 ring-navy" />}
          </span>
          <span className="whitespace-nowrap text-[10px] font-semibold">{t("Mai mult")}</span>
        </button>
      </nav>
    </>
  );
}
