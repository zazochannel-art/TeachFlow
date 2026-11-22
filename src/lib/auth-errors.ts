import { makeT, type T } from "@/lib/i18n/core";

/** Maps Supabase auth error messages to friendly copy (Romanian source text, translated with `t`). */
const MESSAGES: [RegExp, string][] = [
  [/^no_teacher_role$/, "Acest cont nu are acces de profesor."],
  [/invalid login credentials/i, "Email sau parolă greșită."],
  [/email not confirmed/i, "Confirmă-ți adresa de email din mesajul primit, apoi autentifică-te."],
  [/user already registered/i, "Există deja un cont cu acest email. Autentifică-te sau resetează parola."],
  [/password should be at least/i, "Parola trebuie să aibă cel puțin 8 caractere."],
  [/same.*password|different from the old/i, "Parola nouă trebuie să fie diferită de cea veche."],
  [/rate limit|too many requests|security purposes/i, "Prea multe încercări. Așteaptă un minut și încearcă din nou."],
  [/unable to validate email|invalid.*email/i, "Adresa de email nu este validă."],
  [/expired|invalid.*(token|code|flow)|otp/i, "Linkul a expirat sau a fost deja folosit. Cere unul nou."],
  [/session.*missing|not authenticated/i, "Sesiunea a expirat. Deschide din nou linkul din email."],
];

export function authErrorMessage(message?: string | null, t: T = makeT("ro")): string {
  if (!message) return t("A apărut o eroare. Încearcă din nou.");
  for (const [re, text] of MESSAGES) if (re.test(message)) return t(text);
  return t(message);
}

/** Messages of our own that the sign-in page may show from the URL (auth/callback). */
const URL_MESSAGES = new Set(["Supabase nu este configurat.", "Link invalid."]);

/**
 * An error that arrives in the URL (`/login?error=…`). Anyone can make such a link, so only known
 * messages are shown; any other text becomes the generic message instead of appearing on the
 * sign-in page word for word.
 */
export function authErrorFromUrl(value: string | null | undefined, t: T = makeT("ro")): string {
  if (!value) return "";
  for (const [re, text] of MESSAGES) if (re.test(value)) return t(text);
  if (URL_MESSAGES.has(value)) return t(value);
  return t("A apărut o eroare. Încearcă din nou.");
}

/** Only allow same-site relative paths as post-auth redirect targets. */
export function safeNext(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
