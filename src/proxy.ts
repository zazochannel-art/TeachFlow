import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { buildCsp, newNonce } from "@/lib/security/csp";

export async function proxy(request: NextRequest) {
  // Next.js reads the nonce from the request's CSP header and puts it on its scripts;
  // x-nonce lets the root layout put it on its own inline script.
  const nonce = newNonce();
  const csp = buildCsp(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
