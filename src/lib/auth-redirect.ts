import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Sends an already signed-in visitor away from the login/register screens. */
export async function redirectIfSignedIn(to = "/dashboard") {
  const supabase = await createClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(to);
}
