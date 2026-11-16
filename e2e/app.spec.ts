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

  test("register asks to accept the terms", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByText("Creând contul, accepți")).toBeVisible();
  });
});

test.describe("teacher workspace (demo)", () => {
  for (const path of ["/dashboard", "/calendar", "/students", "/courses", "/homework", "/messages", "/payments", "/classroom", "/settings"]) {
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

  test("browser error reports are accepted and odd ones dropped", async ({ request }) => {
    expect((await request.post("/api/client-error", { data: { message: "e2e test", path: "/x" } })).status()).toBe(204);
    expect((await request.post("/api/client-error", { data: "not json" })).status()).toBe(204);
  });
});
