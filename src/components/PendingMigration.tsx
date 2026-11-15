import { getT } from "@/lib/i18n/server";

/** Shown on pages whose tables come from a migration that is not applied yet. */
export async function PendingMigration({ file = "0013" }: { file?: string }) {
  const t = await getT();
  return (
    <div className="mb-6 rounded-[20px] border border-[#f3dfb3] bg-[#fff8e8] p-4 text-[12px] text-[#7a5410]">
      {t("Funcția nu este activată încă. Rulează fișierul SQL {n} în Supabase → SQL Editor, apoi reîncarcă pagina.", { n: file })}
    </div>
  );
}
