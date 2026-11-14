import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?error=${encodeURIComponent("Session missing")}`);
  return <AuthShell><ResetPasswordForm email={data.user.email ?? ""} /></AuthShell>;
}
