// Gate in front of `npm run db:reset`, which drops the schema.
//
// `prisma migrate reset` is a CLI command with no hook to run code before it,
// so the guard runs as a separate process in the npm script and the `&&` does
// the rest: a non-zero exit here means the reset never starts.
//
// tsx rather than node alone because the check itself is TypeScript, shared
// with `prisma/seed.ts` and with its own unit tests. One rule, one place.
import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve(process.cwd(), ".env");
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const { checkDestructive } = await import("../src/server/db/destructive-guard.ts");

const url = process.env.DATABASE_URL?.trim();
if (url) {
  const check = checkDestructive(url, process.env.MALFLEKS_DESTRUCTIVE_OK);
  if (!check.allowed) {
    console.error(`\nRefusing to run ${process.argv[2] ?? "this command"}.\n`);
    console.error(check.reason);
    console.error("");
    process.exit(1);
  }
}
