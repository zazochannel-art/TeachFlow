import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ChatView } from "@/components/chat-view";
import { Empty, Screen, TopBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTeacher } from "@/lib/teacher-data";

export default function TeacherChat() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { data, reload } = useTeacher();
  const student = data.students.find(s => s.id === studentId);
  const messages = data.messages.filter(m => m.student_id === studentId);
  const unread = messages.some(m => m.direction === "incoming" && !m.read_at);

  useEffect(() => {
    if (!unread || !studentId) return;
    supabase.from("messages").update({ read_at: new Date().toISOString() })
      .eq("teacher_id", data.userId).eq("student_id", studentId).eq("direction", "incoming").is("read_at", null)
      .then(() => reload());
  }, [unread, studentId, data.userId, reload]);

  if (!student) return <Screen edges={["top"]}><TopBar title="Mesaje" /><Empty text="Conversația nu a fost găsită." /></Screen>;

  return (
    <ChatView
      title={student.full_name}
      messages={messages}
      mine="outgoing"
      tz={data.timezone}
      notice={student.user_id ? undefined : "Elevul nu are încă cont în portal. Mesajele rămân ca jurnal până acceptă invitația."}
      onSend={async body => {
        const { error } = await supabase.from("messages").insert({
          teacher_id: data.userId, student_id: student.id, direction: "outgoing", body, read_at: new Date().toISOString()
        });
        if (error) return error.message;
        await reload();
        return null;
      }}
    />
  );
}
