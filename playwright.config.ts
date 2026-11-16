import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks of the app in demo mode (no Supabase env vars): every page renders with the
 * labelled demo data, so the main flows can be clicked through in CI without a database.
 * Run with `npm run e2e` after `npm run build`.
 */
const PORT = 3210;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", locale: "ro-RO" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Demo mode: make sure no real project is used even if the shell has the variables.
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" }
  }
});
