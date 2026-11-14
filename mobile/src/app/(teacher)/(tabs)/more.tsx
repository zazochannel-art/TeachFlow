import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Text, View } from "react-native";
import { Avatar, Badge, Button, Card, Divider, ListRow, PageTitle, Screen, type IconName } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { WEB_URL } from "@/lib/config";
import { useTeacher } from "@/lib/teacher-data";
import { C, S } from "@/lib/theme";

const PLANS: Record<string, string> = { free: "Gratuit", starter: "Starter", pro: "Pro", premium: "Premium" };

function Item({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle?: string; onPress: () => void }) {
  return <ListRow title={title} subtitle={subtitle} onPress={onPress}
    left={<View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={18} color={C.primary2} /></View>} />;
}

export default function More() {
  const { data } = useTeacher();
  const { signOut } = useAuth();
  const toReview = data.homework.filter(h => h.status === "submitted").length;
  const pending = data.payments.filter(p => p.status === "pending").length;

  return (
    <Screen>
      <PageTitle title="Mai mult" />
      <Card style={{ flexDirection: "row", alignItems: "center", gap: S.md, marginBottom: S.lg }}>
        <Avatar name={data.fullName || data.email || "?"} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: C.ink }}>{data.fullName || "Profesor"}</Text>
          <Text style={{ color: C.muted }}>{data.email}</Text>
        </View>
        {data.subscription ? <Badge label={PLANS[data.subscription.plan_code] ?? data.subscription.plan_code} /> : null}
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Item icon="document-text-outline" title="Teme" subtitle={toReview ? `${toReview} de verificat` : "Atribuie și verifică teme"} onPress={() => router.push("/homework")} />
        <Divider />
        <Item icon="wallet-outline" title="Plăți" subtitle={pending ? `${pending} neachitate` : "Evidența încasărilor"} onPress={() => router.push("/payments")} />
        <Divider />
        <Item icon="book-outline" title="Cursuri" subtitle={`${data.courses.length} cursuri`} onPress={() => router.push("/courses")} />
      </Card>

      <Card style={{ padding: 0, overflow: "hidden", marginTop: S.lg }}>
        <Item icon="globe-outline" title="Deschide versiunea web" subtitle="Setări, abonament, invitații elevi" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/dashboard`)} />
      </Card>

      <Text style={{ color: C.muted, fontSize: 13, textAlign: "center", marginVertical: S.lg }}>
        Datele sunt sincronizate cu aplicația web: orice modificare apare în ambele locuri.
      </Text>
      <Button title="Deconectează-te" kind="danger" icon="log-out-outline" onPress={signOut} />
    </Screen>
  );
}
