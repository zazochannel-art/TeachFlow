import { Tabs } from "expo-router/js-tabs";
import { tabIcon as icon } from "@/components/tab-icon";
import { useStudentData } from "@/lib/student-data";
import { C } from "@/lib/theme";

export default function StudentTabs() {
  const { data } = useStudentData();
  const unread = data?.messages.filter(m => m.direction === "outgoing" && !m.read_at).length ?? 0;
  const todo = data?.homework.filter(h => h.status === "assigned").length ?? 0;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.primary,
      tabBarInactiveTintColor: C.muted,
      tabBarStyle: { backgroundColor: C.panel, borderTopColor: C.line },
      tabBarLabelStyle: { fontWeight: "700", fontSize: 11 }
    }}>
      <Tabs.Screen name="lectii" options={{ title: "Lecții", tabBarIcon: icon("calendar-outline", "calendar") }} />
      <Tabs.Screen name="teme" options={{ title: "Teme", tabBarIcon: icon("document-text-outline", "document-text"), tabBarBadge: todo || undefined }} />
      <Tabs.Screen name="inbox" options={{ title: "Mesaje", tabBarIcon: icon("chatbubbles-outline", "chatbubbles"), tabBarBadge: unread || undefined }} />
      <Tabs.Screen name="cont" options={{ title: "Cont", tabBarIcon: icon("person-outline", "person") }} />
    </Tabs>
  );
}
