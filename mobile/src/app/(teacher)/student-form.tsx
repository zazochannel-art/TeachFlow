import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ChipRow, ErrorNote, Field, Label, TopBar, confirm, styles as ui } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTeacher } from "@/lib/teacher-data";
import { S } from "@/lib/theme";

export default function StudentForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, reload } = useTeacher();
  const existing = id ? data.students.find(s => s.id === id) : undefined;
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(existing?.status ?? "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (fullName.trim().length < 2) return setError("Numele este prea scurt.");
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Email invalid.");
    const row = { full_name: fullName.trim().slice(0, 120), email: email.trim() || null, phone: phone.trim() || null, notes: notes.trim() || null, status };
    setBusy(true);
    const res = existing
      ? await supabase.from("students").update(row).eq("id", existing.id).eq("teacher_id", data.userId).select("id").single()
      : await supabase.from("students").insert({ ...row, teacher_id: data.userId }).select("id").single();
    setBusy(false);
    if (res.error) return setError(res.error.message);
    await reload();
    if (existing) router.back();
    else router.replace(`/student/${res.data.id}`);
  }

  async function remove() {
    if (!existing) return;
    if (!(await confirm("Ștergi elevul?", "Se șterg și temele, mesajele și plățile lui. Nu se poate anula."))) return;
    const { error } = await supabase.from("students").delete().eq("id", existing.id).eq("teacher_id", data.userId);
    if (error) return setError(error.message);
    await reload();
    router.dismissTo("/students");
  }

  return (
    <SafeAreaView style={ui.screen} edges={["top", "bottom"]}>
      <TopBar title={existing ? "Editează elevul" : "Elev nou"} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={ui.screenContent} keyboardShouldPersistTaps="handled">
          <ErrorNote text={error} />
          <Field label="Nume complet" value={fullName} onChangeText={setFullName} placeholder="Ion Popescu" maxLength={120} />
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="opțional" />
          <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="opțional" maxLength={40} />
          <Field label="Notițe" value={notes} onChangeText={setNotes} multiline maxLength={1000} placeholder="Nivel, obiective, preferințe…" />
          {existing ? (
            <View style={{ marginBottom: S.lg }}>
              <Label>Stare</Label>
              <ChipRow options={[{ value: "active", label: "Activ" }, { value: "inactive", label: "Inactiv" }]} value={status} onChange={setStatus} />
            </View>
          ) : null}
          <Button title={existing ? "Salvează" : "Adaugă elevul"} onPress={save} loading={busy} />
          {existing ? <Button title="Șterge elevul" kind="danger" icon="trash-outline" onPress={remove} style={{ marginTop: S.md }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
