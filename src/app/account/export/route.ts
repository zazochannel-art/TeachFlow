import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportUserData } from "@/lib/account";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Descarcă datele mele": everything the signed-in user can see in TeachFlow, as one JSON file. */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ demo: true, note: "Demo mode: there is no account data to export." });
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const tables = await exportUserData(supabase);
  const body = JSON.stringify({
    exported_at: new Date().toISOString(),
    user: { id: userId, email: typeof data?.claims?.email === "string" ? data.claims.email : null },
    tables
  }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="teachflow-date-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store"
    }
  });
}
