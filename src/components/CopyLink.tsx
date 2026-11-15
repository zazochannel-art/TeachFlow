"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** A link in a read-only field with a copy button. */
export function CopyLink({ url }: { url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the field stays selectable */ }
  };
  return (
    <div className="flex gap-2">
      <input readOnly value={url} aria-label={t("Linkul paginii")} onFocus={e => e.currentTarget.select()} className="tf-input min-w-0 flex-1 py-2 text-[12px]" />
      <button type="button" onClick={copy} className="tf-btn shrink-0 px-3 py-2 text-[12px]">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t("Copiat") : t("Copiază")}</button>
    </div>
  );
}
