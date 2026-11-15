import { getT } from "@/lib/i18n/server";

/** Shown on pages whose tables come from migration 0013 until it is applied. */
export async function PendingMigration() {
  const t = await getT();
  return (
    <div className="mb-6 rounded-[20px] border border-[#f3dfb3] bg-[#fff8e8] p-4 text-[12px] text-[#7a5410]">
      {t("Funcția nu este activată încă. Rulează fișierul SQL 0013 în Supabase → SQL Editor, apoi reîncarcă pagina.")}
    </div>
  );
}
