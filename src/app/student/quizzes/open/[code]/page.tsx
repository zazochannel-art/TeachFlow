import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getT } from "@/lib/i18n/server";

/** Share link of a test: opens the student's own copy, if the test was given to them. */
export default async function OpenQuizByCode({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, t] = await Promise.all([params, getT()]);
  const supabase = await createClient();
  let id: string | null = null;
  if (supabase && /^[A-Za-z0-9_-]{4,64}$/.test(code)) {
    const { data } = await supabase.rpc("quiz_open_by_code", { p_code: code });
    id = typeof data === "string" ? data : null;
  }
  if (id) redirect(`/student/quizzes/${id}`);
  return (
    <div className="mx-auto max-w-xl">
      <Card className="p-6 text-center">
        <p className="text-[16px] font-extrabold text-ink">{t("Testul nu este disponibil")}</p>
        <p className="mt-2 text-[13px] text-muted">{t("Acest test nu ți-a fost atribuit sau linkul nu mai este valid. Verifică dacă ești autentificat cu contul tău de elev.")}</p>
        <Link href="/student/quizzes" className="tf-btn mt-5 inline-flex">{t("Vezi testele mele")}</Link>
      </Card>
    </div>
  );
}
