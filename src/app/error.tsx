"use client";

import Link from "next/link";
import { useEffect } from "react";
import { sendClientError } from "@/components/ErrorReporter";
import { useT } from "@/lib/i18n/client";

/** Shown when a page throws. The server already logged it; the digest links the two. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { sendClientError({ message: error.message || "render error", digest: error.digest }); }, [error]);
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-[20px] font-extrabold">{t("Ceva nu a mers bine")}</h1>
        <p className="mt-2 text-[13px] text-muted">{t("Am înregistrat eroarea. Încearcă din nou; dacă se repetă, revino peste câteva minute.")}</p>
        {error.digest && <p className="mt-2 text-[11px] text-muted">{t("Cod")}: {error.digest}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={reset} className="tf-btn">{t("Încearcă din nou")}</button>
          <Link href="/" className="tf-btn-ghost">{t("Pagina principală")}</Link>
        </div>
      </div>
    </main>
  );
}
