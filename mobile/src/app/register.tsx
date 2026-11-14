import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Logo } from "@/components/logo";
import { Button, Card, ErrorNote, Field, Screen } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { authStyles as styles } from "@/components/auth-styles";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    if (!name.trim() || !email.trim()) { setError("Completează numele și emailul."); return; }
    if (password.length < 8) { setError("Parola trebuie să aibă cel puțin 8 caractere."); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: `${WEB_URL}/auth/callback` }
    });
    setBusy(false);
    if (error) { setError(friendlyError(error.message)); return; }
    if (!data.session) setSent(true);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <View style={styles.hero}>
          <Logo size={56} />
          <Text style={styles.brand}>Cont nou de profesor</Text>
          <Text style={styles.tagline}>Elevii primesc acces prin invitația trimisă de tine.</Text>
        </View>
        {sent ? (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "800", marginBottom: 6 }}>Verifică emailul</Text>
            <Text style={styles.muted}>Ți-am trimis un link de confirmare la {email.trim()}. După confirmare, revino aici și autentifică-te.</Text>
          </Card>
        ) : (
          <>
            <ErrorNote text={error} />
            <Field label="Nume complet" value={name} onChangeText={setName} autoComplete="name" placeholder="Ana Popescu" />
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="nume@exemplu.md" />
            <Field label="Parolă" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="Minimum 8 caractere." />
            <Button title="Creează contul" onPress={submit} loading={busy} />
          </>
        )}
        <View style={[styles.footer, { marginTop: 24 }]}>
          <Text style={styles.muted}>Ai deja cont? </Text>
          <Link href="/login" style={styles.link}>Intră în cont</Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
