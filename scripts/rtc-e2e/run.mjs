// Automated end-to-end test of the lesson call with real WebRTC media between separate browser
// processes ("devices"). Needs a production build made with NEXT_PUBLIC_RTC_TEST_BUS and a server
// started with RTC_TEST_HARNESS=1 (see docs/video-classroom.md → "Automated tests").
//
//   node scripts/rtc-e2e/run.mjs [p2p|sfu|all]
//
// Each "device" is its own Chromium process with a fake camera (moving test pattern) and a fake
// microphone (beep). The test checks on the receiving side that video frames really change and that
// the audio is not silent, so a call that only *looks* connected fails.
import { createRequire } from "node:module";

// Playwright is not a project dependency: install it once with `npm i --no-save playwright && npx playwright install chromium`.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const RELAY = process.env.RELAY_URL ?? "ws://localhost:8787";
const which = process.argv[2] ?? "all";
const LESSON_A = "00000000-0000-4000-8000-0000000000aa";
const LESSON_B = "00000000-0000-4000-8000-0000000000bb";
const results = [];
const browsers = [];

async function device(name) {
  const browser = await chromium.launch({
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--autoplay-policy=no-user-gesture-required"]
  });
  browsers.push(browser);
  const context = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", e => console.log(`[${name}] pageerror`, e.message));
  return { name, browser, context, page };
}

async function open(dev, q) {
  await dev.page.goto(`${BASE}/dev/call?${new URLSearchParams(q)}`);
  await dev.page.getByRole("button", { name: q.audioOnly ? "Doar audio" : "Intră în apel" }).click();
  await dev.page.locator('[data-testid="tile-me"]').waitFor();
}

async function check(label, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ label, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${label} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ label, ok: false, err: String(e?.message ?? e).split("\n")[0] });
    console.log(`  ✗ ${label}: ${String(e?.message ?? e).split("\n")[0]}`);
  }
}

/** Real media check on the receiving page for the tile of `peerName`: frames change, audio is audible. */
async function mediaFrom(dev, peerName, { video = true, audio = true, timeout = 20000 } = {}) {
  const sel = `[data-testid="tile-peer"][data-name="${peerName}"] video`;
  await dev.page.locator(sel).first().waitFor({ state: "attached", timeout });
  const res = await dev.page.evaluate(async ({ sel, video, audio, timeout }) => {
    const v = document.querySelector(sel);
    const deadline = Date.now() + timeout;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = { videoWidth: 0, framesChanged: false, audioRms: 0 };
    if (video) {
      while (Date.now() < deadline && !(v.videoWidth > 0 && v.readyState >= 2)) await sleep(200);
      out.videoWidth = v.videoWidth;
      const c = document.createElement("canvas");
      c.width = 64; c.height = 36;
      const g = c.getContext("2d");
      const snap = () => { g.drawImage(v, 0, 0, 64, 36); return g.getImageData(0, 0, 64, 36).data; };
      // Frames must keep changing (a frozen last frame is not a working call); retry for slow machines.
      for (let tries = 0; tries < 4 && !out.framesChanged && Date.now() < deadline; tries++) {
        const a = snap();
        await sleep(1500);
        const b = snap();
        let diff = 0;
        for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]);
        out.diff = diff;
        out.framesChanged = diff > 300;
      }
    }
    if (audio) {
      while (Date.now() < deadline && !(v.srcObject && v.srcObject.getAudioTracks().length)) await sleep(150);
      const stream = v.srcObject;
      if (!stream?.getAudioTracks().length) return out;
      const ctx = new AudioContext();
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let best = 0;
      while (Date.now() < deadline && best < 0.01) {
        await sleep(150);
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += x * x;
        best = Math.max(best, Math.sqrt(sum / buf.length));
      }
      out.audioRms = best;
      await ctx.close();
    }
    return out;
  }, { sel, video, audio, timeout });
  if (video && !(res.videoWidth > 0 && res.framesChanged)) throw new Error(`no live video from ${peerName} at ${dev.name} (${JSON.stringify(res)})`);
  if (audio && !(res.audioRms > 0.01)) throw new Error(`no audio from ${peerName} at ${dev.name} (rms ${res.audioRms.toFixed(4)})`);
  return res;
}

const attr = (dev, peer, name) => dev.page.locator(`[data-testid="tile-peer"][data-name="${peer}"]`).first().getAttribute(`data-${name}`);
async function waitAttr(dev, peer, name, value, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await attr(dev, peer, name).catch(() => null)) === value) return;
    await dev.page.waitForTimeout(200);
  }
  throw new Error(`${peer}.${name} != ${value} at ${dev.name}`);
}
const peerCount = dev => dev.page.locator('[data-testid="tile-peer"]').count();

async function p2p() {
  console.log("\nP2P (WebRTC direct, STUN):");
  const teacher = await device("teacher");
  const student = await device("student");
  await open(teacher, { role: "teacher", id: "teacher-1", name: "Prof", lesson: LESSON_A });
  await open(student, { role: "student", id: "student-1", name: "Ana", lesson: LESSON_A });

  await check("teacher receives the student's video and audio", () => mediaFrom(teacher, "Ana"));
  await check("student receives the teacher's video and audio", () => mediaFrom(student, "Prof"));
  await check("both show the connected state and a quality indicator", async () => {
    await waitAttr(teacher, "Ana", "status", "connected");
    await student.page.locator("[data-quality]").first().waitFor();
    // The tile shows its quality bars only once a real measurement exists.
    await teacher.page.waitForFunction(() => ["good", "fair", "poor"].includes(document.querySelector('[data-testid="tile-peer"] [data-quality]')?.getAttribute("data-quality") ?? ""), null, { timeout: 15000 });
    await student.page.waitForFunction(() => ["good", "fair", "poor"].includes(document.querySelector('header [data-quality]')?.getAttribute("data-quality") ?? ""), null, { timeout: 15000 });
  });

  await check("microphone off/on is seen by the other side", async () => {
    await student.page.getByRole("button", { name: "Oprește microfonul" }).click();
    await waitAttr(teacher, "Ana", "mic", "false");
    await student.page.getByRole("button", { name: "Pornește microfonul" }).click();
    await waitAttr(teacher, "Ana", "mic", "true");
  });
  await check("camera off/on is seen by the other side", async () => {
    await student.page.getByRole("button", { name: "Oprește camera" }).click();
    await waitAttr(teacher, "Ana", "cam", "false");
    await student.page.getByRole("button", { name: "Pornește camera" }).click();
    await waitAttr(teacher, "Ana", "cam", "true");
    await mediaFrom(teacher, "Ana", { audio: false });
  });
  await check("screen share reaches the other side, camera comes back after", async () => {
    await teacher.page.getByRole("button", { name: "Arată ecranul în apel" }).click();
    await waitAttr(student, "Prof", "screen", "true");
    await mediaFrom(student, "Prof", { audio: false });
    await teacher.page.getByRole("button", { name: "Oprește partajarea ecranului" }).click();
    await waitAttr(student, "Prof", "screen", "false");
  });
  await check("chat message arrives", async () => {
    await student.page.getByRole("button", { name: "Chat" }).first().click();
    await student.page.getByPlaceholder("Scrie un mesaj…").fill("Salut, profesore!");
    await student.page.getByRole("button", { name: "Trimite" }).click();
    await teacher.page.getByRole("button", { name: "Chat" }).first().click();
    await teacher.page.getByText("Salut, profesore!").waitFor({ timeout: 5000 });
  });
  await check("messages in someone else's name are ignored (signed signalling)", async () => {
    // A third party on the channel: it sees every message, but cannot sign as anybody else.
    const { WebSocket } = createRequire(import.meta.url)("ws");
    const spy = new WebSocket(`${RELAY}?topic=${encodeURIComponent(`screen:${LESSON_A}`)}`);
    const seen = [];
    spy.on("message", data => { try { seen.push(JSON.parse(String(data))); } catch { /* ignore */ } });
    await new Promise((resolve, reject) => { spy.on("open", resolve); spy.on("error", reject); });
    const said = text => seen.find(m => m.event === "call" && m.payload?.d?.includes(text));
    // The student mutes: a signed "state" message tells us the student's key and gives us something to replay.
    await student.page.getByRole("button", { name: "Oprește microfonul" }).click();
    await waitAttr(teacher, "Ana", "mic", "false");
    await student.page.getByRole("button", { name: "Pornește microfonul" }).click();
    await waitAttr(teacher, "Ana", "mic", "true");
    const muted = seen.find(m => m.event === "call" && m.payload?.d?.includes('"type":"state"') && m.payload.d.includes('"mic":false'));
    if (!muted || !said('"mic":true')) throw new Error("no signed state messages seen on the channel");
    const key = muted.payload.k;
    const send = payload => spy.send(JSON.stringify({ event: "call", payload }));
    send({ type: "bye", from: key });                                                     // unsigned, old style
    send({ v: 1, k: key, n: 9e15, d: JSON.stringify({ type: "bye", from: key }), s: "A".repeat(86) }); // forged signature
    send(muted.payload);                                                                  // replay of "microphone off"
    await new Promise(r => setTimeout(r, 2500));
    spy.close();
    await waitAttr(teacher, "Ana", "status", "connected", 1000);
    await waitAttr(teacher, "Ana", "mic", "true", 1000);
  });
  await check("student reloads the page and rejoins: media flows again", async () => {
    await student.page.reload();
    await student.page.getByRole("button", { name: "Intră în apel" }).click();
    await mediaFrom(teacher, "Ana");
    await mediaFrom(student, "Prof");
    if ((await peerCount(teacher)) !== 1) throw new Error(`teacher sees ${await peerCount(teacher)} peers`);
  });
  await check("audio-only participant: no camera, audio still flows", async () => {
    const third = await device("student2");
    await open(third, { role: "student", id: "student-2", name: "Ion", lesson: LESSON_A, audioOnly: "1" });
    await mediaFrom(teacher, "Ion", { video: false });
    await waitAttr(teacher, "Ion", "cam", "false");
    await third.page.getByRole("button", { name: "Ieși din apel" }).click();
    await teacher.page.locator('[data-testid="tile-peer"][data-name="Ion"]').waitFor({ state: "detached", timeout: 10000 });
    await third.browser.close();
  });
  await check("simultaneous calls in two lessons stay separate", async () => {
    const t2 = await device("teacher-B");
    const s2 = await device("student-B");
    await open(t2, { role: "teacher", id: "teacher-1", name: "ProfB", lesson: LESSON_B });
    await open(s2, { role: "student", id: "student-9", name: "Dan", lesson: LESSON_B });
    await mediaFrom(t2, "Dan");
    await mediaFrom(teacher, "Ana", { audio: false });
    if ((await peerCount(t2)) !== 1 || (await peerCount(teacher)) !== 1) throw new Error("rooms leaked into each other");
    await t2.browser.close();
    await s2.browser.close();
  });
  await check("teacher leaves: the student is told", async () => {
    await teacher.page.getByRole("button", { name: "Ieși din apel" }).click();
    await student.page.getByText("Profesorul a ieșit din apel.").waitFor({ timeout: 10000 });
  });
  await teacher.page.screenshot({ path: "/tmp/rtc-e2e-teacher.png" }).catch(() => {});
  await student.page.screenshot({ path: "/tmp/rtc-e2e-student.png" }).catch(() => {});
  await teacher.browser.close();
  await student.browser.close();
}

async function sfu() {
  console.log("\nSFU (LiveKit), group lesson with 3 people:");
  const teacher = await device("teacher");
  const a = await device("student-a");
  const b = await device("student-b");
  const q = (role, id, name) => ({ role, id, name, transport: "sfu", lesson: LESSON_A });
  await open(teacher, q("teacher", "teacher-1", "Prof"));
  await open(a, q("student", "student-1", "Ana"));
  await open(b, q("student", "student-2", "Ion"));

  await check("teacher receives video+audio from both students", async () => { await mediaFrom(teacher, "Ana"); await mediaFrom(teacher, "Ion"); });
  await check("each student receives the teacher and the other student", async () => { await mediaFrom(a, "Prof"); await mediaFrom(a, "Ion"); await mediaFrom(b, "Prof"); });
  await check("roles come from the server token (teacher badge)", async () => {
    await a.page.locator('[data-testid="tile-peer"][data-name="Prof"]').getByText("Profesor").first().waitFor();
  });
  await check("mute and camera off propagate", async () => {
    await a.page.getByRole("button", { name: "Oprește microfonul" }).click();
    await waitAttr(teacher, "Ana", "mic", "false");
    await a.page.getByRole("button", { name: "Oprește camera" }).click();
    await waitAttr(teacher, "Ana", "cam", "false");
    await a.page.getByRole("button", { name: "Pornește camera" }).click();
    await waitAttr(teacher, "Ana", "cam", "true");
  });
  await check("screen share through the SFU", async () => {
    await teacher.page.getByRole("button", { name: "Arată ecranul în apel" }).click();
    await waitAttr(b, "Prof", "screen", "true", 15000);
    await mediaFrom(b, "Prof", { audio: false });
  });
  await check("chat over the SFU data channel", async () => {
    await b.page.getByRole("button", { name: "Chat" }).first().click();
    await b.page.getByPlaceholder("Scrie un mesaj…").fill("Bună tuturor");
    await b.page.getByRole("button", { name: "Trimite" }).click();
    await teacher.page.getByRole("button", { name: "Chat" }).first().click();
    await teacher.page.getByText("Bună tuturor").waitFor({ timeout: 5000 });
  });
  await check("a student leaves and comes back", async () => {
    await b.page.getByRole("button", { name: "Ieși din apel" }).click();
    await teacher.page.locator('[data-testid="tile-peer"][data-name="Ion"]').waitFor({ state: "detached", timeout: 10000 });
    await b.page.getByRole("button", { name: "Intră în apel" }).click();
    await mediaFrom(teacher, "Ion");
  });
  await teacher.page.screenshot({ path: "/tmp/rtc-e2e-sfu-teacher.png" }).catch(() => {});
  for (const d of [teacher, a, b]) await d.browser.close();
}

try {
  if (which === "p2p" || which === "all") await p2p();
  if (which === "sfu" || which === "all") await sfu();
} finally {
  for (const b of browsers) await b.close().catch(() => {});
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
