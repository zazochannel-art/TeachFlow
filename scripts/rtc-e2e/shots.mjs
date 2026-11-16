// Screenshots of the call UI with two real participants (for reviews). Same setup as run.mjs.
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.argv[2] ?? "/tmp";
const args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen"];
const tb = await chromium.launch({ args });
const sb = await chromium.launch({ args });
const t = await (await tb.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
const s = await (await sb.newContext({ ...devices["iPhone 13"], permissions: ["camera", "microphone"] })).newPage();
await t.goto(`${BASE}/dev/call?role=teacher&id=teacher-1&name=Prof.%20Ion%20Rusu`);
await s.goto(`${BASE}/dev/call?role=student&id=student-1&name=Ana%20Popescu`);
for (const p of [t, s]) {
  // Retry until the page is hydrated and the call view is up.
  for (let i = 0; i < 10 && !(await p.locator('[data-testid="tile-me"]').count()); i++) {
    await p.getByRole("button", { name: "Intră în apel" }).click().catch(() => {});
    await p.waitForTimeout(1000);
  }
}
await t.waitForTimeout(9000);
await s.getByRole("button", { name: "Chat" }).first().click();
await s.getByPlaceholder("Scrie un mesaj…").fill("Bună ziua! Vă aud bine.");
await s.getByRole("button", { name: "Trimite" }).click();
await t.getByRole("button", { name: "Chat" }).first().click();
await t.waitForTimeout(800);
await t.screenshot({ path: `${OUT}/apel-desktop-profesor.png` });
await s.screenshot({ path: `${OUT}/apel-telefon-elev-chat.png` });
await s.getByRole("button", { name: "Închide" }).click();
await t.getByRole("button", { name: "Arată ecranul în apel" }).click();
await s.waitForTimeout(3000);
await s.screenshot({ path: `${OUT}/apel-telefon-elev-ecran.png` });
await t.getByRole("button", { name: "Tablă" }).click();
await t.waitForTimeout(1000);
await t.screenshot({ path: `${OUT}/apel-panou-mic.png` });
await tb.close(); await sb.close();
