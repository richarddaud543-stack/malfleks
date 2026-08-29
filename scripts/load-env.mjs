import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads `.env`, tolerating a byte-order mark.
 *
 * Plain `.mjs` rather than TypeScript on purpose. `prisma.config.ts` and
 * `vitest.config.mts` both import it, and a config file is loaded before any
 * transpiler is in play — Vite's native config loader warned about exactly
 * that ("ESM syntax in a file loaded as CommonJS"). There is no typing worth
 * having here anyway: one string in, nothing out.
 *
 * Next reads `.env` for `dev` and `build`; the Prisma CLI and Vitest read
 * neither, so both `prisma.config.ts` and `vitest.config.mts` call this.
 *
 * ## Why the BOM handling is not defensive padding
 *
 * This cost a real evening on 2026-08-28, on a real Windows machine, and the
 * failure is genuinely invisible.
 *
 * Windows PowerShell 5.1's `Set-Content -Encoding utf8` writes a UTF-8 **byte
 * order mark** — `EF BB BF` — before the first character. (PowerShell 7's
 * `utf8` does not; you have to ask for `utf8BOM`. So the same command behaves
 * differently on two shells both called PowerShell.) Node's `loadEnvFile` does
 * not strip it, and folds it into the first key's *name*. Measured:
 *
 * ```
 * DATABASE_URL  -> undefined
 * SECOND_VAR    -> "ok"            // every later line is fine
 * actual key    -> "﻿DATABASE_URL"
 * ```
 *
 * So a `.env` that looks perfect in every editor loads every variable except
 * the first one, and the resulting error — "DATABASE_URL is not set" — sends
 * you to check the one thing that is demonstrably right there in the file.
 *
 * Three bytes, one variable, no visible difference. Stripping it is four lines.
 */
export function loadDotEnv(root) {
  const envFile = path.resolve(root, ".env");
  if (!existsSync(envFile)) return;

  process.loadEnvFile(envFile);

  // `loadEnvFile` has already run, so a BOM-prefixed key is sitting in the
  // environment under a name nothing will ever look up. Re-file it under the
  // name the author meant. Only ever the first key can be affected.
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith("﻿")) continue;
    const intended = key.slice(1);
    // An explicitly exported variable still wins, exactly as it does for a
    // normally-parsed line.
    if (!(intended in process.env)) process.env[intended] = process.env[key];
  }
}
