import { expect, test, type Page } from "@playwright/test";

/** No horizontal scrolling and no uncaught errors on the page. */
async function healthy(page: Page, errors: string[]) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal overflow").toBeLessThanOrEqual(1);
  expect(errors, "page errors").toEqual([]);
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  // A script blocked by the Content-Security-Policy (src/proxy.ts) is a bug too.
  page.on("console", m => { if (/Content Security Policy/i.test(m.text())) errors.push(m.text()); });
  return errors;
}

test.describe("public pages", () => {
  test("login links to the terms and the privacy policy", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Intră în cont" })).toBeVisible();
    await page.getByRole("link", { name: "Politica de confidențialitate" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Politica de confidențialitate" })).toBeVisible();
    await healthy(page, errors);
  });

  test("legal pages follow the chosen language", async ({ page, context }) => {
    await context.addCookies([{ name: "tf_lang", value: "en", url: "http://localhost:3210" }]);
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
    await context.addCookies([{ name: "tf_lang", value: "ru", url: "http://localhost:3210" }]);
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Политика конфиденциальности" })).toBeVisible();
  });

  test("pages send a nonce-based script policy and still run their scripts", async ({ page, context }) => {
    const errors = trackErrors(page);
    // "system" theme renders the one inline script of our own, which must carry the nonce.
    await context.addCookies([{ name: "tf-theme", value: "system", url: "http://localhost:3210" }]);
    const res = await page.goto("/login");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    const inline = await page.locator("script:not([src])").evaluateAll(els => els.map(e => (e as HTMLScriptElement).nonce));
    expect(inline.length).toBeGreaterThan(0);
    for (const n of inline) expect(n).toBe(nonce);
    // Hydrated: the form reacts.
    await page.getByLabel("Email").fill("a@b.md");
    await expect(page.getByLabel("Email")).toHaveValue("a@b.md");
    await healthy(page, errors);
  });

  test("register asks to accept the terms", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText("Creând contul, accepți")).toBeVisible();
  });
});

test.describe("teacher workspace (demo)", () => {
  for (const path of ["/dashboard", "/calendar", "/students", "/courses", "/homework", "/messages", "/payments", "/classroom", "/settings", "/quizzes", "/billing", "/library"]) {
    test(`${path} renders`, async ({ page }) => {
      const errors = trackErrors(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await healthy(page, errors);
    });
  }

  test("calendar opens the new lesson form with weekly repeat", async ({ page }) => {
    await page.goto("/calendar?new=1");
    await expect(page.getByRole("heading", { name: "Programează o lecție" })).toBeVisible();
    await expect(page.getByLabel("Repetă săptămânal")).toBeVisible();
    await expect(page.getByLabel("Data")).toBeVisible();
  });

  test("messages show a conversation with student and parent tabs", async ({ page }) => {
    await page.goto("/messages");
    const first = page.locator('a[href^="/messages?student="]').first();
    await first.click();
    await expect(page.getByRole("link", { name: "Cu părinții" })).toBeVisible();
  });

  test("homework review shows the student's submission from the full rows", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/homework?status=submitted");
    await page.locator('a[href*="review="]').first().click();
    await expect(page.getByLabel("Feedback pentru elev")).toBeVisible();
    await healthy(page, errors);
  });

  test("billing lists the daily AI requests of each plan", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.getByText("10 cereri AI pe zi")).toBeVisible();
    await expect(page.getByText("250 de cereri AI pe zi")).toBeVisible();
  });

  test("lesson room: the teacher draws on the whiteboard, undoes and redoes", async ({ page, isMobile }) => {
    test.skip(isMobile, "drawing is checked with a mouse on desktop");
    const errors = trackErrors(page);
    await page.goto("/classroom");
    await page.locator('a[href^="/classroom/"]').first().click();
    await expect(page.getByRole("button", { name: "Intră în apel" })).toBeVisible();
    await page.getByRole("button", { name: "Dreptunghi" }).click();
    await page.getByRole("radio", { name: "Roșu" }).click();
    await expect(page.getByRole("radio", { name: "Roșu" })).toHaveAttribute("aria-checked", "true");
    const box = (await page.locator("canvas").first().boundingBox())!;
    const undo = page.getByRole("button", { name: /Anulează/ }).first();
    const redo = page.getByRole("button", { name: /Refă/ }).first();
    await expect(undo).toBeDisabled();
    await page.mouse.move(box.x + 80, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 200, { steps: 8 });
    await page.mouse.up();
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(redo).toBeEnabled();
    await healthy(page, errors);
  });

  test("settings offer the data download and account deletion", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Descarcă datele mele" })).toBeVisible();
    await page.getByText("Șterge contul", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Șterge contul definitiv" })).toBeDisabled();
  });
});

test.describe("portals (demo)", () => {
  for (const path of ["/student", "/student/profile", "/parent", "/parent/profile"]) {
    test(`${path} renders`, async ({ page }) => {
      const errors = trackErrors(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await healthy(page, errors);
    });
  }
});

test.describe("endpoints", () => {
  test("data export answers in demo mode", async ({ request }) => {
    const res = await request.get("/account/export");
    expect(res.ok()).toBe(true);
    expect((await res.json()).demo).toBe(true);
  });

  test("AI test builder refuses without a configured backend", async ({ request }) => {
    const res = await request.post("/api/ai/quiz", { data: { action: "assist", question: {}, command: "x" } });
    expect(res.status()).toBe(503);
    expect(typeof (await res.json()).error).toBe("string");
  });

  test("cron jobs refuse without the secret", async ({ request }) => {
    for (const path of ["/api/cron/reminders", "/api/cron/lesson-push", "/api/cron/parent-reports"]) {
      expect([401, 503]).toContain((await request.get(path, { headers: { Authorization: "Bearer wrong" } })).status());
    }
  });

  test("browser error reports are accepted and odd ones dropped", async ({ request }) => {
    expect((await request.post("/api/client-error", { data: { message: "e2e test", path: "/x" } })).status()).toBe(204);
    expect((await request.post("/api/client-error", { data: "not json" })).status()).toBe(204);
  });
});
