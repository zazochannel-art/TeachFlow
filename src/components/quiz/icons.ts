import { Calculator, CheckCircle2, Link2, ListChecks, ListOrdered, MessageSquareText, PenLine, TextCursorInput, ToggleLeft, type LucideIcon } from "lucide-react";
import type { QuizType } from "@/types/database";

export const TYPE_ICONS: Record<QuizType, LucideIcon> = {
  single: CheckCircle2,
  multi: ListChecks,
  truefalse: ToggleLeft,
  short: TextCursorInput,
  open: MessageSquareText,
  fill: PenLine,
  match: Link2,
  order: ListOrdered,
  numeric: Calculator
};
