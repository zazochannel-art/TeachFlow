import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "./RegisterForm";
import { safeNext } from "@/lib/auth-errors";
import { redirectIfSignedIn } from "@/lib/auth-redirect";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  await redirectIfSignedIn(next);
  return <AuthShell><RegisterForm next={next} /></AuthShell>;
}
