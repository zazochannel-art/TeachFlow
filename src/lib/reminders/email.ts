import type { T } from "@/lib/i18n/core";
import type { Digest } from "./digest";

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function sections(d: Digest, t: T) {
  return [
    { title: t("Lecțiile de mâine"), items: d.tomorrow, note: d.noLink ? t.n("{n} lecție nu are încă link de conectare.|{n} lecții nu au încă link de conectare.|{n} de lecții nu au încă link de conectare.", d.noLink) : null, path: "/calendar" },
    { title: t("Teme de verificat"), items: d.review, note: null, path: "/homework?status=submitted" },
    { title: t("Plăți restante"), items: d.overdue, note: null, path: "/payments?status=overdue" }
  ].filter(s => s.items.length);
}

/** Plain HTML (inline styles, no images) plus a text version of the daily digest. */
export function renderDigestEmail(d: Digest, t: T, opts: { name: string; appUrl: string }) {
  const parts = sections(d, t);
  const hello = t("Bună dimineața, {name}!", { name: opts.name });
  const intro = t("Iată ce te așteaptă în TeachFlow.");
  const footer = t("Primești acest email pentru că ai activat reminderele. Le poți opri din Setări.");

  const html = `<!doctype html><html lang="${t.lang}"><body style="margin:0;background:#f1f2ff;font-family:Arial,Helvetica,sans-serif;color:#1d1b4b">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#ffffff;border-radius:20px;padding:28px">
<p style="margin:0 0 4px;font-size:20px;font-weight:bold">${esc(hello)}</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b6f93">${esc(intro)}</p>
${parts.map(s => `<p style="margin:20px 0 8px;font-size:15px;font-weight:bold">${esc(s.title)}</p>
<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${s.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
${s.note ? `<p style="margin:8px 0 0;font-size:13px;color:#a2660a">${esc(s.note)}</p>` : ""}
<p style="margin:8px 0 0;font-size:13px"><a href="${esc(opts.appUrl + s.path)}" style="color:#5269e8;font-weight:bold">${esc(t("Deschide în TeachFlow"))}</a></p>`).join("\n")}
</div>
<p style="margin:16px 8px 0;font-size:11px;color:#8a8fb3">${esc(footer)} <a href="${esc(opts.appUrl + "/settings")}" style="color:#8a8fb3">${esc(t("Setări"))}</a></p>
</div></body></html>`;

  const text = [hello, intro, "", ...parts.flatMap(s => [s.title.toUpperCase(), ...s.items.map(i => `- ${i}`), ...(s.note ? [s.note] : []), opts.appUrl + s.path, ""]), footer, opts.appUrl + "/settings"].join("\n");
  return { subject: d.subject, html, text };
}

/** Sends one email through the Resend HTTP API. */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }, env: { apiKey: string; from: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text })
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
