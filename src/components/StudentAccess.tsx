"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Link2, UserCheck } from "lucide-react";
import { createStudentInvite, unlinkStudentAccount } from "@/lib/actions/invites";
import { ConfirmSubmit } from "@/components/forms";
import type { FormState } from "@/lib/actions/common";

type InviteState = FormState & { link?: string };

/** "Cont elev" block in the student edit panel: invite link or linked-account status. */
export function StudentAccess({ studentId, studentName, linked, demo }: { studentId: string; studentName: string; linked: boolean; demo: boolean }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createStudentInvite, {});
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!state.link) return;
    try { await navigator.clipboard.writeText(state.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the field stays selectable */ }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="mb-1 text-[13px] font-extrabold">Cont pentru elev</h3>
      {linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl bg-[#e7f6ee] px-3 py-2 text-[12px] font-bold text-[#1b8a5a]"><UserCheck className="h-4 w-4" /> {studentName} are cont și vede orarul, temele și plățile.</span>
          <form action={unlinkStudentAccount}><input type="hidden" name="student_id" value={studentId} /><ConfirmSubmit label="Revocă accesul" confirm="Confirmă revocarea" /></form>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[12px] text-muted">Trimite elevului (sau părintelui) un link. După ce își face cont, vede lecțiile cu linkul de conectare, temele (le poate preda online), plățile și îți poate scrie.</p>
          <form action={action} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="student_id" value={studentId} />
            <button className="tf-btn-ghost" disabled={pending || demo}><Link2 className="h-4 w-4" /> {pending ? "Se creează…" : state.link ? "Generează alt link" : "Creează link de invitație"}</button>
            {demo && <span className="text-[11px] text-muted">Indisponibil în modul demonstrativ.</span>}
          </form>
          {state.error && <p role="alert" className="mt-3 text-[12px] font-semibold text-[#c03a3a]">{state.error}</p>}
          {state.link && (
            <div className="mt-3">
              <div className="flex gap-2">
                <input readOnly value={state.link} aria-label="Link de invitație" className="tf-input font-mono text-[12px]" onFocus={e => e.currentTarget.select()} />
                <button type="button" onClick={copy} className="tf-btn shrink-0">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiat" : "Copiază"}</button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted">{state.ok}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
