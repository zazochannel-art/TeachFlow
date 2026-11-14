import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-errors";
import { LANG_COOKIE, isLang } from "@/lib/i18n/core";

/**
 * Landing point for links in Supabase auth emails (sign-up confirmation,
 * password recovery, email change). Exchanges the one-time code for a
 * session cookie, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, origin));

  const linkError = searchParams.get("error_description") ?? searchParams.get("error");
  if (linkError) return fail(linkError);

  const supabase = await createClient();
  if (!supabase) return fail("Supabase nu este configurat.");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail(error.message);
  } else {
    return fail("Link invalid.");
  }

  // Carry the language picked before signing up / in on this device into the profile.
  const lang = request.cookies.get(LANG_COOKIE)?.value;
  if (isLang(lang)) {
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (userId) await supabase.from("profiles").update({ preferred_language: lang }).eq("id", userId);
  }

  const target = type === "recovery" ? "/reset-password" : next;
  return NextResponse.redirect(new URL(target, origin));
}
