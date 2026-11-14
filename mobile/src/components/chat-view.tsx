import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, R, S } from "@/lib/theme";
import { formatDate, formatTime } from "@/lib/time";
import type { Message } from "@/lib/types";
import { ErrorNote, TopBar, styles as ui } from "./ui";

/** Shared chat screen. `mine` decides which messages are drawn on the right. */
export function ChatView({ title, messages, mine, tz, onSend, notice }: {
  title: string; messages: Message[]; mine: Message["direction"]; tz: string;
  onSend: (body: string) => Promise<string | null>; notice?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);
  const items = [...messages].reverse();

  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: true }); }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    const err = await onSend(body);
    setBusy(false);
    if (err) setError(err); else setText("");
  }

  return (
    <SafeAreaView style={ui.screen} edges={["top", "bottom"]}>
      <TopBar title={title} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={list}
          inverted
          data={items}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: S.lg, gap: S.sm }}
          ListFooterComponent={notice ? <Text style={styles.notice}>{notice}</Text> : undefined}
          ListEmptyComponent={<Text style={[styles.notice, { transform: [{ scaleY: -1 }] }]}>Niciun mesaj încă. Scrie primul!</Text>}
          renderItem={({ item }) => {
            const me = item.direction === mine;
            return (
              <View style={[styles.bubble, me ? styles.me : styles.them]}>
                <Text style={[styles.body, me && { color: "#fff" }]}>{item.body}</Text>
                <Text style={[styles.time, me && { color: "rgba(255,255,255,0.75)" }]}>{formatDate(item.created_at, tz)} · {formatTime(item.created_at, tz)}</Text>
              </View>
            );
          }}
        />
        <View style={{ paddingHorizontal: S.lg }}><ErrorNote text={error} /></View>
        <View style={styles.composer}>
          <TextInput value={text} onChangeText={setText} placeholder="Scrie un mesaj…" placeholderTextColor={C.muted} multiline maxLength={4000} style={styles.input} />
          <Pressable onPress={send} disabled={busy || !text.trim()} style={[styles.send, (!text.trim() || busy) && { opacity: 0.5 }]} accessibilityLabel="Trimite">
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "82%", borderRadius: R.lg, paddingHorizontal: 14, paddingVertical: 10 },
  me: { alignSelf: "flex-end", backgroundColor: C.primary, borderBottomRightRadius: 6 },
  them: { alignSelf: "flex-start", backgroundColor: C.panel, borderBottomLeftRadius: 6 },
  body: { fontSize: 15, color: C.ink },
  time: { fontSize: 11, color: C.muted, marginTop: 4 },
  notice: { color: C.muted, fontSize: 13, textAlign: "center", marginVertical: S.md },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: S.sm, padding: S.md, backgroundColor: C.panel, borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: C.soft, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, color: C.ink },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }
});
