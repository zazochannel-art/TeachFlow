import type { HomeworkStatus } from "@/lib/types";
import type { Tone } from "./ui";

export const HOMEWORK_STATUS: Record<HomeworkStatus, { label: string; tone: Tone }> = {
  assigned: { label: "Atribuită", tone: "primary" },
  submitted: { label: "Predată", tone: "amber" },
  reviewed: { label: "Verificată", tone: "green" }
};
