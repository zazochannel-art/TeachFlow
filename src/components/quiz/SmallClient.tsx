"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, Loader2, Play } from "lucide-react";
import { startQuiz } from "@/lib/actions/quizzes";
import { QuizPlayer } from "./QuizPlayer";
import { useT } from "@/lib/i18n/client";
import type { PublicQuestion } from "@/types/database";

/** Copies a link to the clipboard. */
export function CopyLink({ url }: { url: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={url} className="tf-input py-2 text-[12px]" aria-label={t("Linkul testului")} onFocus={e => e.currentTarget.select()} />
      <button type="button" className="tf-btn shrink-0 px-3 py-2 text-[12px]"
        onClick={async () => { try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard blocked */ } }}>
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {done ? t("Copiat") : t("Copiază")}
      </button>
    </div>
  );
}

/** Opens the test as the student will see it (nothing is saved). */
export function PreviewButton({ title, instructions, questions, images, minutes }: {
  title: string; instructions?: string | null; questions: PublicQuestion[]; images: Record<string, string>; minutes: number | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [deadline, setDeadline] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => { setDeadline(minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null); setOpen(true); }} className="tf-btn-ghost px-3 py-1.5 text-[12px]">
        <Eye className="h-3.5 w-3.5" /> {t("Previzualizează ca elev")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={t("Previzualizare")}>
          <QuizPlayer preview title={title} instructions={instructions} questions={questions} images={images} deadlineAt={deadline} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

/** Starts (or retakes) a test for the student; the timer starts on the server. */
export function StartQuizButton({ assignmentId, label, demo }: { assignmentId: string; label: string; demo?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <button type="button" className="tf-btn" disabled={busy || demo}
        onClick={async () => {
          setBusy(true); setError("");
          const r = await startQuiz(assignmentId);
          if (r.error) { setError(r.error); setBusy(false); return; }
          router.refresh();
        }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {label}
      </button>
      {error && <p role="alert" className="mt-2 text-[12px] font-semibold text-[#c03a3a]">{t(error)}</p>}
    </div>
  );
}
