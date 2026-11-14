import * as WebBrowser from "expo-web-browser";
import { Text, View } from "react-native";
import { Badge, Button, Card, Empty, Screen, TopBar } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { useTeacher } from "@/lib/teacher-data";
import { C, S } from "@/lib/theme";
import { formatMoney } from "@/lib/time";

export default function Courses() {
  const { data, reload } = useTeacher();
  return (
    <Screen edges={["top"]} padded={false} onRefresh={reload}>
      <TopBar title="Cursuri" />
      <View style={{ padding: S.lg }}>
        {data.courses.length ? data.courses.map(c => (
          <Card key={c.id} style={{ marginBottom: S.sm, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <Text style={{ flex: 1, fontWeight: "800", fontSize: 16, color: C.ink }}>{c.title}</Text>
              {!c.is_active ? <Badge label="Inactiv" tone="muted" /> : null}
            </View>
            <Text style={{ color: C.muted }}>
              {[c.subject, c.level, c.format === "group" ? "grup" : "individual", c.price != null ? formatMoney(Number(c.price), c.currency) : null].filter(Boolean).join(" · ")}
            </Text>
          </Card>
        )) : <Empty icon="book-outline" text="Nu ai cursuri încă." />}
        <Button title="Gestionează cursurile pe web" kind="secondary" icon="open-outline" style={{ marginTop: S.lg }} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/courses`)} />
      </View>
    </Screen>
  );
}
