import Link from "next/link";
import { GraduationCap, UserPlus } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { ActionForm } from "@/components/forms";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/lib/actions/student";
import { isInviteToken } from "@/lib/invite-token";
import { getT } from "@/lib/i18n/server";

type Preview = { teacher_name: string | null; student_name: string | null; status: "valid" | "used" | "expired" | "invalid" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [supabase, t] = await Promise.all([createClient(), getT()]);
  const here = `/invite/${token}`;

  let preview: Preview = { teacher_name: null, student_name: null, status: "invalid" };
  let notReady = false;
  if (supabase && isInviteToken(token)) {
    const { data, error } = await supabase.rpc("student_invite_preview", { p_token: token });
    if (error) notReady = true;
    else if (Array.isArray(data) && data[0]) preview = data[0] as Preview;
  }
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = auth.user;

  const message = !supabase ? t("Configurează Supabase pentru a folosi invitațiile.")
    : notReady ? t("Portalul elevilor nu este activat încă. Anunță profesorul.")
    : preview.status === "expired" ? t("Linkul a expirat. Cere profesorului unul nou.")
    : preview.status === "used" ? t("Invitația a fost deja folosită. Dacă e contul tău, autentifică-te.")
    : preview.status === "invalid" ? t("Linkul de invitație nu este valid.")
    : null;

  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-[400px]">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-tint text-primary"><GraduationCap className="h-7 w-7" /></span>
        {message ? (
          <>
            <h1 className="mt-5 text-[22px] font-extrabold tracking-tight text-ink">{t("Invitație indisponibilă")}</h1>
            <p className="mt-2 text-[13px] text-muted">{message}</p>
            <Link href={user ? "/student" : "/login"} className="tf-btn-ghost mt-6 inline-flex">{user ? t("Mergi la contul tău") : t("Autentificare")}</Link>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-[22px] font-extrabold tracking-tight text-ink">{t("{name} te invită în TeachFlow", { name: preview.teacher_name || t("Profesorul tău") })}</h1>
            <p className="mt-2 text-[13px] text-muted">
              {t("Contul va fi legat de elevul")} <b className="text-ink">{preview.student_name}</b>. {t("Vei vedea orarul cu linkurile de lecție, temele (le poți preda online), plățile și vei putea scrie profesorului.")}
            </p>
            {user ? (
              <div className="mt-6">
                <p className="mb-3 text-[12px] text-muted">{t("Autentificat ca")} <b className="text-ink">{user.email}</b>.</p>
                <ActionForm action={acceptInvite} submitLabel={t("Acceptă invitația")} className="grid gap-3">
                  <input type="hidden" name="token" value={token} />
                </ActionForm>
              </div>
            ) : (
              <div className="mt-6 grid gap-3">
                <Link href={`/register?next=${encodeURIComponent(here)}`} className="tf-btn"><UserPlus className="h-4 w-4" /> {t("Creează cont de elev")}</Link>
                <Link href={`/login?next=${encodeURIComponent(here)}`} className="tf-btn-ghost">{t("Am deja cont")}</Link>
              </div>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
