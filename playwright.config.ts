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
    // There used to be a seeded `storageState` here, pre-answering the
    // analytics consent banner so it was not sitting over the bottom of the
    // viewport intercepting clicks in specs about something else. Both the
    // banner and `consent.spec.ts` went with Firebase Analytics on 2026-08-29,
    // and a seeded key for a feature that no longer reads it is the kind of
    // dead config that outlives everyone who knew why it was there.
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
