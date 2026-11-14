import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { authStyles as styles } from "@/components/auth-styles";
import { Logo } from "@/components/logo";
import { Button, ErrorNote, Field, Screen } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!email.trim() || !password) { setError("Completează emailul și parola."); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(friendlyError(error.message));
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <View style={styles.hero}>
          <Logo size={64} />
          <Text style={styles.brand}>TeachFlow</Text>
          <Text style={styles.tagline}>Predă mai simplu. Același cont ca pe web.</Text>
        </View>
        <ErrorNote text={error} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="nume@exemplu.md" />
        <Field label="Parolă" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="••••••••" onSubmitEditing={submit} />
        <Button title="Intră în cont" onPress={submit} loading={busy} />
        <Pressable style={styles.forgot} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/forgot-password`)}>
          <Text style={styles.link}>Ai uitat parola?</Text>
        </Pressable>
        <View style={styles.footer}>
          <Text style={styles.muted}>Nu ai cont? </Text>
          <Link href="/register" style={styles.link}>Creează unul</Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
