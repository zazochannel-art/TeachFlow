import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "./RegisterForm";
import { redirectIfSignedIn } from "@/lib/auth-redirect";

export default async function RegisterPage() {
  await redirectIfSignedIn();
  return <AuthShell><RegisterForm /></AuthShell>;
}
