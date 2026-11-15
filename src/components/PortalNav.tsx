"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";

/** Top navigation of the student and parent portals. `home` is matched exactly, other links by prefix. */
export function PortalNav({ home, messages, extra = [], unread, label }: {
  home: string; messages: string; extra?: Array<{ href: string; label: string }>; unread: number; label: string;
}) {
  const path = usePathname();
  const t = useT();
  // The messages page marks everything read while it renders, but the layout (and its count) is not
  // re-rendered on client navigation. Hide the count once seen, until the server sends a different one.
  const onMessages = path.startsWith(messages);
  const [seen, setSeen] = useState<number | null>(null);
  if (onMessages && seen !== unread) setSeen(unread);
  const badge = onMessages || seen === unread ? 0 : unread;
  const items = [{ href: home, label: "Acasă" }, { href: messages, label: "Mesaje", badge }, ...extra];
  return (
    <nav className="tf-scroll order-last -mx-1 flex w-[calc(100%+0.5rem)] gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:px-0" aria-label={t(label)}>
      {items.map(i => {
        const active = i.href === home ? path === home : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
            className={`relative shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-[13px] font-bold ${active ? "bg-primary" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
            {t(i.label)}
            {"badge" in i && !!i.badge && <span className="ml-2 rounded-full bg-white px-1.5 text-[10px] font-extrabold text-primary-2">{i.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
