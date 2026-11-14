"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/actions/common";
import { useT } from "@/lib/i18n/client";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Form bound to a server action, with inline error/success messages. */
export function ActionForm({
  action, children, submitLabel, demo = false, className = "grid gap-4 sm:grid-cols-2", resetOnOk = false, extra
}: {
  action: Action; children: ReactNode; submitLabel?: string; demo?: boolean; className?: string; resetOnOk?: boolean; extra?: ReactNode;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnOk && state.ok) ref.current?.reset(); }, [state, resetOnOk]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error && <p role="alert" className="text-[12px] font-semibold text-[#c03a3a] sm:col-span-2">{t(state.error)}</p>}
      {state.ok && state.ok !== "sent" && <p role="status" className="text-[12px] font-semibold text-[#1b8a5a] sm:col-span-2">{t(state.ok)}</p>}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="tf-btn" disabled={pending || demo}>{pending ? t("Se salvează…") : submitLabel ?? t("Salvează")}</button>
        {extra}
        {demo && <span className="text-[11px] text-muted">{t("Indisponibil în modul demonstrativ.")}</span>}
      </div>
    </form>
  );
}

/** Submit button for small one-click forms (status changes etc.). */
export function SubmitButton({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={`cursor-pointer disabled:opacity-50 ${className}`}>{children}</button>;
}

/** Two-step delete button: the first click asks, the second submits. */
export function ConfirmSubmit({ label, confirm, className = "" }: { label?: string; confirm?: string; className?: string }) {
  const t = useT();
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed
    ? <button disabled={pending} className={`cursor-pointer rounded-xl bg-[#c03a3a] px-3 py-2 text-[12px] font-bold text-white ${className}`}>{pending ? t("Se șterge…") : confirm ?? t("Confirmi ștergerea?")}</button>
    : <button type="button" onClick={() => setArmed(true)} className={`cursor-pointer rounded-xl border border-[#f1caca] px-3 py-2 text-[12px] font-bold text-[#c03a3a] hover:bg-[#fdecec] ${className}`}>{label ?? t("Șterge")}</button>;
}
