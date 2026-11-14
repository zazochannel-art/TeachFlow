import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ChatView } from "@/components/chat-view";
import { Empty, Screen, TopBar } from "@/components/ui";
import { friendlyError } from "@/lib/errors";
import { useStudentData } from "@/lib/student-data";
import { supabase } from "@/lib/supabase";

export default function StudentChat() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { data, reload } = useStudentData();
  const record = data?.records.find(r => r.id === studentId);
  const messages = data?.messages.filter(m => m.student_id === studentId) ?? [];
  const unread = messages.some(m => m.direction === "outgoing" && !m.read_at);

  useEffect(() => {
    if (unread) supabase.rpc("mark_student_messages_read").then(() => reload());
  }, [unread, reload]);

  if (!data || !record) return <Screen edges={["top"]}><TopBar title="Mesaje" /><Empty text="Conversația nu a fost găsită." /></Screen>;

  return (
    <ChatView
      title={data.teachers[record.teacher_id] ?? "Profesor"}
      messages={messages}
      mine="incoming"
      tz={data.timezone}
      onSend={async body => {
        const { error } = await supabase.rpc("send_student_message", { p_student_id: record.id, p_body: body });
        if (error) return friendlyError(error.message);
        await reload();
        return null;
      }}
    />
  );
}
