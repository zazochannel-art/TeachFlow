"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Link2, Users } from "lucide-react";
import { createParentInvite, removeParentLink } from "@/lib/actions/invites";
import { ConfirmSubmit } from "@/components/forms";
import type { FormState } from "@/lib/actions/common";
import { useT } from "@/lib/i18n/client";

type InviteState = FormState & { link?: string };
export interface LinkedParent { link_id: string; full_name: string; email: string | null }

/** "Cont pentru părinți" block in the student edit panel: linked parent accounts and an invite link. */
export function ParentAccess({ studentId, parents, demo }: { studentId: string; parents: LinkedParent[]; demo: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createParentInvite, {});
  const [copied, setCopied] = useState(false);
  const t = useT();

  async function copy() {
    if (!state.link) return;
    try { await navigator.clipboard.writeText(state.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the field stays selectable */ }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="mb-1 text-[13px] font-extrabold">{t("Cont pentru părinți")}</h3>
      <p className="mb-3 text-[12px] text-muted">{t("Părintele vede orarul, prezența, temele cu notele și plățile copilului și îți poate scrie. Nu poate preda teme și nu intră în lecții.")}</p>
      {parents.length > 0 && (
        <div className="mb-3 grid gap-2">
          {parents.map(p => (
            <div key={p.link_id} className="flex flex-wrap items-center gap-3 rounded-xl bg-soft px-3 py-2">
              <Users className="h-4 w-4 text-primary-2" />
              <div className="min-w-0 flex-1 text-[12px]">
                <b className="text-ink">{p.full_name || t("Părinte")}</b>
                {p.email && <span className="ml-2 text-muted">{p.email}</span>}
              </div>
              <form action={removeParentLink}><input type="hidden" name="link_id" value={p.link_id} /><ConfirmSubmit label={t("Revocă accesul")} confirm={t("Confirmă revocarea")} /></form>
            </div>
          ))}
        </div>
      )}
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="student_id" value={studentId} />
        <button className="tf-btn-ghost" disabled={pending || demo}><Link2 className="h-4 w-4" /> {pending ? t("Se creează…") : state.link ? t("Generează alt link") : parents.length ? t("Invită încă un părinte") : t("Invită un părinte")}</button>
        {demo && <span className="text-[11px] text-muted">{t("Indisponibil în modul demonstrativ.")}</span>}
      </form>
      {state.error && <p role="alert" className="mt-3 text-[12px] font-semibold text-[#c03a3a]">{t(state.error)}</p>}
      {state.link && (
        <div className="mt-3">
          <div className="flex gap-2">
            <input readOnly value={state.link} aria-label={t("Link de invitație pentru părinte")} className="tf-input font-mono text-[12px]" onFocus={e => e.currentTarget.select()} />
            <button type="button" onClick={copy} className="tf-btn shrink-0">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? t("Copiat") : t("Copiază")}</button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">{state.ok && t(state.ok)}</p>
        </div>
      )}
    </div>
  );
}
