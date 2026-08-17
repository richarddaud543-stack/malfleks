import { defineConfig, devices } from "@playwright/test";

// `next dev` and `next start` both read PORT, so setting it is enough to move
// the whole run. Unset — which is how CI runs — this is exactly the previous
// behaviour. It exists because several worktrees share one machine, and a Lead
// with a dev server on 3000 otherwise blocks every agent's E2E run.
const port = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Every spec but consent.spec.ts runs as a visitor who has already
    // answered the analytics banner, so it is not sitting over the bottom of
    // the viewport intercepting clicks in specs that are about something else.
    // "denied" rather than "granted" on purpose: no spec should be quietly
    // firing real Analytics requests. consent.spec.ts overrides this with an
    // empty state to test the first-visit path.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            { name: "soko:analytics-consent:v1", value: "denied" },
          ],
        },
      ],
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // CI serves a production build (the workflow runs `npm run build` first).
    // `next dev` compiles each route on first request, which under parallel
    // workers is slow enough to time specs out — real flakiness, not a real
    // failure. Locally, dev stays the default so a spec can be re-run against
    // an edit without rebuilding.
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
