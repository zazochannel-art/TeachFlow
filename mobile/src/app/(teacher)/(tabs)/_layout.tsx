import { Tabs } from "expo-router/js-tabs";
import { tabIcon as icon } from "@/components/tab-icon";
import { useTeacher } from "@/lib/teacher-data";
import { C } from "@/lib/theme";

export default function TeacherTabs() {
  const { data } = useTeacher();
  const unread = data.messages.filter(m => m.direction === "incoming" && !m.read_at).length;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.primary,
      tabBarInactiveTintColor: C.muted,
      tabBarStyle: { backgroundColor: C.panel, borderTopColor: C.line },
      tabBarLabelStyle: { fontWeight: "700", fontSize: 11 }
    }}>
      <Tabs.Screen name="index" options={{ title: "Panou", tabBarIcon: icon("grid-outline", "grid") }} />
      <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarIcon: icon("calendar-outline", "calendar") }} />
      <Tabs.Screen name="students" options={{ title: "Elevi", tabBarIcon: icon("people-outline", "people") }} />
      <Tabs.Screen name="messages" options={{ title: "Mesaje", tabBarIcon: icon("chatbubbles-outline", "chatbubbles"), tabBarBadge: unread || undefined }} />
      <Tabs.Screen name="more" options={{ title: "Mai mult", tabBarIcon: icon("menu-outline", "menu") }} />
    </Tabs>
  );
}
