"use client";

import { useCallback } from "react";
import type { MediaProblem } from "@/lib/board/call";
import { useT } from "@/lib/i18n/client";

/** User-facing text for a failed getUserMedia / getDisplayMedia call. */
export function useMediaProblemText() {
  const t = useT();
  return useCallback((p: MediaProblem, what: "cam" | "mic" | "both" | "screen") => {
    if (p === "denied") {
      return what === "screen" ? t("Partajarea ecranului a fost anulată sau refuzată.")
        : what === "cam" ? t("Ai refuzat accesul la cameră. Permite-l din bara de adrese a browserului și încearcă din nou.")
        : t("Ai refuzat accesul la microfon. Permite-l din bara de adrese a browserului și încearcă din nou.");
    }
    if (p === "notFound") return what === "cam" ? t("Nu am găsit nicio cameră pe acest dispozitiv.") : t("Nu am găsit niciun microfon pe acest dispozitiv.");
    if (p === "busy") return t("Camera sau microfonul este folosit de altă aplicație. Închide-o și încearcă din nou.");
    if (p === "unsupported") return what === "screen" ? t("Partajarea ecranului nu este disponibilă pe acest dispozitiv sau browser.") : t("Browserul nu suportă apeluri video. Folosește Chrome, Edge, Firefox sau Safari actualizat.");
    return t("Nu am acces la cameră sau microfon. Permite-le din setările browserului și încearcă din nou.");
  }, [t]);
}
