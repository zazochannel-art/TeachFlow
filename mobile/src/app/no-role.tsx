import { Text } from "react-native";
import { Button, Card, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function NoRole() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <Card style={{ marginTop: 64, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Contul nu are acces încă</Text>
        <Text style={{ color: "#858ba8" }}>Contul tău nu are un rol de profesor sau elev. Dacă ești elev, deschide linkul de invitație primit de la profesor.</Text>
        <Button title="Deconectează-te" kind="secondary" onPress={signOut} />
      </Card>
    </Screen>
  );
}
