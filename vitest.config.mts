import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // The Security Rules suite needs the Firebase emulator (and therefore
    // Java), so it runs from vitest.rules.config.mts via `npm run test:rules`
    // and has its own CI job. See that file for why it is not folded in here.
    // Spread the defaults rather than replace them: `exclude` is not merged,
    // so writing only our own entry would drop `**/node_modules/**`.
    exclude: [...configDefaults.exclude, "src/security/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
