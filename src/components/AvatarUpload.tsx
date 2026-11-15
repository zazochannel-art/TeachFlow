"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { AVATARS_BUCKET, AVATAR_ACCEPT, MAX_AVATAR_BYTES } from "@/lib/avatars";
import { saveAvatar } from "@/lib/actions/avatar";
import { useT } from "@/lib/i18n/client";

/**
 * Round photo with a camera button. The picture is shrunk in the browser (max 512 px, JPEG/WebP),
 * uploaded to the public avatars bucket under the user's own folder, then saved on the profile
 * (or on the student, when `studentId` is given).
 */
export function AvatarUpload({ name, src, studentId = "", size = 72, disabled = false }: {
  name: string; src: string | null; studentId?: string; size?: number; disabled?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) { setError(t("Alege o poză (JPG, PNG sau WebP).")); return; }
    if (file.size > 15 * 1024 * 1024) { setError(t("Poza e prea mare.")); return; }
    const supabase = createClient();
    if (!supabase) { setError(t("Pozele nu se pot încărca în modul demonstrativ.")); return; }
    setBusy(true);
    try {
      const blob = await shrink(file);
      if (blob.size > MAX_AVATAR_BYTES) { setError(t("Poza e prea mare.")); return; }
      const { data: claims } = await supabase.auth.getClaims();
      const uid = claims?.claims?.sub;
      if (!uid) { setError(t("Sesiunea a expirat. Intră din nou în cont.")); return; }
      const path = `${uid}/${studentId ? `s-${studentId}` : "me"}-${Date.now().toString(36)}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
      const up = await supabase.storage.from(AVATARS_BUCKET).upload(path, blob, { contentType: blob.type, upsert: true });
      if (up.error) { setError(t("Poza nu a putut fi încărcată. Verifică dacă migrarea 0011 este aplicată.")); return; }
      const url = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
      const res = await saveAvatar(studentId, url);
      if (res.error) { setError(t(res.error)); return; }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    const res = await saveAvatar(studentId, null);
    setBusy(false);
    if (res.error) setError(t(res.error)); else startTransition(() => router.refresh());
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <Avatar name={name} src={src} size={size} className="ring-4 ring-tint" />
        {!disabled && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={t("Schimbă poza")} title={t("Schimbă poza")}
            className="absolute -bottom-1 -right-1 grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-primary text-white shadow-lift ring-2 ring-white hover:brightness-110 disabled:opacity-70">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
        )}
        <input ref={input} type="file" accept={AVATAR_ACCEPT} className="sr-only" tabIndex={-1} onChange={e => void pick(e.target.files?.[0])} />
      </div>
      {!disabled && (
        <div className="min-w-0 text-[12px]">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="cursor-pointer font-bold text-primary hover:underline">
            {src ? t("Schimbă poza") : t("Adaugă o poză")}
          </button>
          {src && (
            <button type="button" onClick={() => void remove()} disabled={busy} className="ml-3 inline-flex cursor-pointer items-center gap-1 font-bold text-muted hover:text-[#c03a3a]">
              <Trash2 className="h-3.5 w-3.5" /> {t("Scoate")}
            </button>
          )}
          {error && <p role="alert" className="mt-1 font-semibold text-[#c03a3a]">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Centre-crops to a square and scales to at most 512 px. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(512, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const webp = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/webp", 0.85));
  if (webp && webp.type === "image/webp") return webp;
  return await new Promise<Blob>((r, j) => canvas.toBlob(b => (b ? r(b) : j(new Error("encode"))), "image/jpeg", 0.85));
}
