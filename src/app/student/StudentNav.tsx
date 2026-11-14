"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StudentNav({ unread }: { unread: number }) {
  const path = usePathname();
  const items = [{ href: "/student", label: "Acasă" }, { href: "/student/messages", label: "Mesaje", badge: unread }];
  return (
    <nav className="order-last flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Portal elev">
      {items.map(i => {
        const active = i.href === "/student" ? path === "/student" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={`relative rounded-xl px-4 py-2 text-[13px] font-bold ${active ? "bg-primary" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
            {i.label}
            {!!i.badge && <span className="ml-2 rounded-full bg-white px-1.5 text-[10px] font-extrabold text-primary-2">{i.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
