import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";
import { authErrorMessage, safeNext } from "@/lib/auth-errors";
import { redirectIfSignedIn } from "@/lib/auth-redirect";
import { getT } from "@/lib/i18n/server";

type Search = Promise<{ error?: string; next?: string; reset?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const t = await getT();
  const next = safeNext(sp.next);
  // With an error to show (e.g. a signed-in account without teacher access),
  // stay on the page instead of bouncing back to the app.
  if (!sp.error) await redirectIfSignedIn(next);
  return (
    <AuthShell>
      <LoginForm
        next={next}
        initialError={sp.error ? authErrorMessage(sp.error, t) : ""}
        initialInfo={sp.reset ? t("Parola a fost schimbată. Autentifică-te cu parola nouă.") : ""}
      />
    </AuthShell>
  );
}
