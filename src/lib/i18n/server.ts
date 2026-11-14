import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LANG, LANG_COOKIE, isLang, langFromAcceptLanguage, makeT, type Lang } from "./core";

/**
 * Language for this request: the signed-in user's profile setting,
 * otherwise the language picked on this device, otherwise the browser's.
 */
export const getLang = cache(async (): Promise<Lang> => {
  const supabase = await createClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (userId) {
      const { data: profile } = await supabase.from("profiles").select("preferred_language").eq("id", userId).maybeSingle();
      if (isLang(profile?.preferred_language)) return profile.preferred_language;
    }
  }
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(cookieLang)) return cookieLang;
  return langFromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LANG;
});

export async function getT() {
  return makeT(await getLang());
}

export async function rememberLang(lang: Lang) {
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
