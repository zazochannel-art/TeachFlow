"use client";

import { useEffect } from "react";
import { sendClientError } from "@/components/ErrorReporter";

/** Last resort when the root layout itself fails: no providers, so the text is plain and trilingual. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { sendClientError({ message: error.message || "root error", digest: error.digest }); }, [error]);
  return (
    <html lang="ro">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f4f5fb", color: "#11104f" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>TeachFlow</h1>
          <p style={{ fontSize: 14 }}>Ceva nu a mers bine · Что-то пошло не так · Something went wrong</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, border: 0, background: "#5269e8", color: "#fff", fontWeight: 700, cursor: "pointer" }}>↻</button>
        </div>
      </body>
    </html>
  );
}
