import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Dashboard } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Keep the dashboard usable as a clearly-labelled demo before Supabase setup.
  if (supabase) {
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;

    if (error || !userId) redirect("/login");

    const { data: roleRecord } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (!roleRecord || !["teacher", "admin"].includes(roleRecord.role)) {
      redirect("/login");
    }
  }

  return <div className="app-shell"><Sidebar/><Dashboard/></div>;
}
