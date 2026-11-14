/** Maps Supabase auth error messages to Romanian copy shown in the UI. */
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

export function authErrorMessage(message?: string | null): string {
  if (!message) return "A apărut o eroare. Încearcă din nou.";
  for (const [re, text] of MESSAGES) if (re.test(message)) return text;
  return message;
}

/** Only allow same-site relative paths as post-auth redirect targets. */
export function safeNext(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
