"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendTestPush } from "@/lib/actions/push";
import { useT } from "@/lib/i18n/client";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

const toB64 = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : "");

/**
 * Turns push notifications on or off for this browser / phone. The subscription is saved with
 * save_push_subscription (migration 0013); the server sends lessons, homework and messages to it.
 */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const t = useT();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (alive) setState(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") { if (alive) setState("denied"); return; }
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (alive) setState(sub ? "on" : "off");
    })().catch(() => alive && setState("unsupported"));
    return () => { alive = false; };
  }, []);

  if (!publicKey) return <p className="text-[12px] text-muted">{t("Notificările nu sunt configurate pe server.")}</p>;

  const enable = async () => {
    setBusy(true); setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const supabase = createClient();
      if (!supabase) throw new Error("demo");
      const { error } = await supabase.rpc("save_push_subscription", {
        p_endpoint: sub.endpoint, p_p256dh: toB64(sub.getKey("p256dh")), p_auth: toB64(sub.getKey("auth")), p_user_agent: navigator.userAgent
      });
      if (error) throw error;
      setState("on");
      setNote({ ok: true, text: t("Gata! Vei primi notificări pe acest dispozitiv.") });
    } catch {
      setNote({ ok: false, text: t("Nu am putut activa notificările. Încearcă din nou.") });
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setNote(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await createClient()?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setNote(null);
    const res = await sendTestPush();
    setNote(res.ok ? { ok: true, text: t("Notificarea de test a fost trimisă.") } : { ok: false, text: t(res.error ?? "A apărut o eroare. Încearcă din nou.") });
    setBusy(false);
  };

  return (
    <div>
      <p className="text-[12px] text-muted">{t("Primești pe telefon sau pe calculator lecțiile noi, temele, testele și mesajele, chiar dacă TeachFlow e închis.")}</p>
      {state === "ios-install" && <p className="mt-3 rounded-xl bg-soft p-3 text-[12px] text-ink">{t("Pe iPhone: deschide TeachFlow în Safari, apasă „Partajează” → „Adaugă pe ecranul principal”, apoi deschide aplicația de pe ecran și activează notificările de aici.")}</p>}
      {state === "unsupported" && <p className="mt-3 text-[12px] font-semibold text-muted">{t("Acest browser nu acceptă notificări. Încearcă Chrome, Edge, Firefox sau Safari.")}</p>}
      {state === "denied" && <p className="mt-3 text-[12px] font-semibold text-[#a2660a]">{t("Notificările sunt blocate pentru acest site. Permite-le din setările browserului, apoi reîncarcă pagina.")}</p>}
      {(state === "off" || state === "on" || state === "loading") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {state === "on" ? (
            <>
              <button type="button" onClick={test} disabled={busy} className="tf-btn py-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} {t("Trimite o notificare de test")}</button>
              <button type="button" onClick={disable} disabled={busy} className="tf-btn-ghost py-2"><BellOff className="h-4 w-4" /> {t("Oprește pe acest dispozitiv")}</button>
            </>
          ) : (
            <button type="button" onClick={enable} disabled={busy || state === "loading"} className="tf-btn py-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} {t("Activează notificările")}</button>
          )}
        </div>
      )}
      {note && <p role="status" className={`mt-2 text-[12px] font-semibold ${note.ok ? "text-[#1b8a5a]" : "text-[#c03a3a]"}`}>{note.text}</p>}
    </div>
  );
}
