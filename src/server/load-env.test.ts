// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadDotEnv } from "../../scripts/load-env.mjs";

/**
 * Regression cover for a failure that wasted an evening on a real Windows
 * machine and left no visible trace in the file.
 *
 * Windows PowerShell 5.1's `Set-Content -Encoding utf8` prepends a UTF-8 BOM.
 * Node's `loadEnvFile` folds those three bytes into the first key's *name*, so
 * `DATABASE_URL` on line 1 loads as `﻿DATABASE_URL` and every lookup for
 * it misses — while every variable on lines 2 onward works perfectly. The
 * resulting "DATABASE_URL is not set" points at the one thing that is plainly
 * present in the file.
 *
 * These tests write a real BOM rather than mocking one, because the whole bug
 * is about bytes that no editor displays.
 */

const KEYS = ["MALFLEKS_TEST_FIRST", "MALFLEKS_TEST_SECOND", "MALFLEKS_TEST_QUOTED"] as const;

let dir: string;

function writeEnv(contents: string, { bom }: { bom: boolean }): void {
  writeFileSync(path.join(dir, ".env"), (bom ? "﻿" : "") + contents, "utf8");
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "malfleks-env-"));
  for (const key of KEYS) delete process.env[key];
  delete process.env["﻿MALFLEKS_TEST_FIRST"];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const key of KEYS) delete process.env[key];
  delete process.env["﻿MALFLEKS_TEST_FIRST"];
});

describe("loadDotEnv", () => {
  it("loads a plain file", () => {
    writeEnv('MALFLEKS_TEST_FIRST="one"\nMALFLEKS_TEST_SECOND="two"\n', { bom: false });
    loadDotEnv(dir);

    expect(process.env.MALFLEKS_TEST_FIRST).toBe("one");
    expect(process.env.MALFLEKS_TEST_SECOND).toBe("two");
  });

  // The bug.
  it("finds the first variable even when the file starts with a BOM", () => {
    writeEnv('MALFLEKS_TEST_FIRST="one"\nMALFLEKS_TEST_SECOND="two"\n', { bom: true });
    loadDotEnv(dir);

    expect(process.env.MALFLEKS_TEST_FIRST).toBe("one");
    // Proving the asymmetry that makes this so confusing to diagnose: without
    // the fix, this one passes and the one above does not.
    expect(process.env.MALFLEKS_TEST_SECOND).toBe("two");
  });

  it("does not disturb a value the shell already exported", () => {
    process.env.MALFLEKS_TEST_FIRST = "from-the-shell";
    writeEnv('MALFLEKS_TEST_FIRST="from-the-file"\n', { bom: true });
    loadDotEnv(dir);

    // CI and one-off runs point the suites at a throwaway database this way.
    // A BOM must not turn that precedence around.
    expect(process.env.MALFLEKS_TEST_FIRST).toBe("from-the-shell");
  });

  it("keeps a connection string's own characters intact", () => {
    // A password can contain almost anything; the BOM strip must take exactly
    // one character off the key and nothing off the value.
    writeEnv('MALFLEKS_TEST_QUOTED="postgresql://u:p%40ss@h:5432/postgres?x=1"\n', {
      bom: true,
    });
    loadDotEnv(dir);

    expect(process.env.MALFLEKS_TEST_QUOTED).toBe(
      "postgresql://u:p%40ss@h:5432/postgres?x=1",
    );
  });

  it("is silent when there is no .env at all", () => {
    expect(() => loadDotEnv(dir)).not.toThrow();
    expect(process.env.MALFLEKS_TEST_FIRST).toBeUndefined();
  });
});
