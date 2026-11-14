const MAP: Record<string, string> = {
  "Invalid login credentials": "Email sau parolă greșită.",
  "Email not confirmed": "Confirmă adresa de email din mesajul primit, apoi autentifică-te.",
  "User already registered": "Există deja un cont cu acest email.",
  homework_not_found: "Tema nu mai poate fi predată (poate a fost deja verificată).",
  empty_submission: "Scrie răspunsul înainte să predai tema.",
  submission_too_long: "Răspunsul este prea lung (maximum 8000 de caractere).",
  empty_message: "Scrie un mesaj.",
  message_too_long: "Mesajul este prea lung.",
  student_not_found: "Conversația nu a fost găsită."
};

export function friendlyError(message: string | undefined | null) {
  if (!message) return "A apărut o eroare. Încearcă din nou.";
  const key = Object.keys(MAP).find(k => message.includes(k));
  if (key) return MAP[key];
  if (/network|fetch/i.test(message)) return "Nu există conexiune la internet.";
  if (/password.*(6|characters)/i.test(message)) return "Parola trebuie să aibă cel puțin 6 caractere.";
  return message;
}
