"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { FILES_BUCKET, parseFileRefs } from "@/lib/files";
import { DEMO_STATE, type FormState, optId, optText, optUrl, parseForm, refresh, teacherCtx } from "./common";

const itemSchema = z.object({
  id: optId,
  title: optText(160),
  description: optText(2000),
  course_id: optId,
  kind: z.enum(["file", "link"]),
  url: optUrl,
  shared: z.literal("on").optional(),
  back: z.string().optional()
});

const back = (v: { back?: string }) => (v.back?.startsWith("/library") ? v.back : "/library");

/** Adds materials (one item per uploaded file, or one link) or edits one item. */
export async function saveLibraryItem(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await teacherCtx();
  if (!ctx) return DEMO_STATE;
  const parsed = parseForm(itemSchema, formData);
  if ("error" in parsed) return parsed;
  const v = parsed.data;
  const base = { description: v.description, course_id: v.course_id, shared: v.shared === "on" };

  if (v.id) {
    const fields: Record<string, unknown> = { ...base, updated_at: new Date().toISOString() };
    if (v.title) fields.title = v.title;
    if (v.kind === "link") {
      if (!v.url) return { error: "Adaugă linkul." };
      fields.url = v.url;
    }
    const { error } = await ctx.supabase.from("library_items").update(fields).eq("id", v.id).eq("teacher_id", ctx.userId);
    if (error) return { error: error.message };
  } else if (v.kind === "link") {
    if (!v.url) return { error: "Adaugă linkul." };
    const title = v.title ?? new URL(v.url).hostname.replace(/^www\./, "");
    const { error } = await ctx.supabase.from("library_items").insert({ ...base, title, kind: "link", url: v.url, teacher_id: ctx.userId });
    if (error) return { error: error.message };
  } else {
    const files = parseFileRefs(formData.get("files"), `lib/${ctx.userId}/`);
    if (!files.length) return { error: "Încarcă cel puțin un fișier." };
    const rows = files.map(f => ({
      ...base, kind: "file", file: f, teacher_id: ctx.userId,
      title: files.length === 1 && v.title ? v.title : (v.title && files.length > 1 ? `${v.title} · ${f.name}` : f.name).slice(0, 160)
    }));
    const { error } = await ctx.supabase.from("library_items").insert(rows);
    if (error) return { error: error.message };
  }
  refresh();
  redirect(back(v));
}

export async function deleteLibraryItem(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  const { data } = await ctx.supabase.from("library_items").select("kind, file").eq("id", id).eq("teacher_id", ctx.userId).maybeSingle();
  const { error } = await ctx.supabase.from("library_items").delete().eq("id", id).eq("teacher_id", ctx.userId);
  if (!error && data?.kind === "file") {
    const path = parseFileRefs([data.file], `lib/${ctx.userId}/`)[0]?.path;
    // Keep the file while homework still lists it (students would lose the attachment).
    const { count } = path ? await ctx.supabase.from("homework").select("id", { count: "exact", head: true }).eq("teacher_id", ctx.userId).contains("attachments", [{ path }]) : { count: 0 };
    if (path && !count) await ctx.supabase.storage.from(FILES_BUCKET).remove([path]);
  }
  refresh();
  redirect(back({ back: String(formData.get("back") ?? "") }));
}

export async function toggleLibraryShared(formData: FormData) {
  const ctx = await teacherCtx();
  const id = String(formData.get("id") ?? "");
  if (!ctx || !id) return;
  await ctx.supabase.from("library_items").update({ shared: formData.get("shared") === "1" }).eq("id", id).eq("teacher_id", ctx.userId);
  refresh();
}
