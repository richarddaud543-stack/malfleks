import { after } from "next/server";

/**
 * Run `work` once the response has gone, so the person waiting is not kept
 * waiting on it.
 *
 * `after` only exists inside a request. Called anywhere else -- a script, a
 * test that calls a Server Action directly -- it throws, and that throw would
 * turn an action that already succeeded into "unavailable". So outside a
 * request the work is simply done now, before returning.
 *
 * `work` must not throw; everything passed here already catches and logs its
 * own failures. A stray rejection is swallowed rather than allowed to become
 * an unhandled one.
 */
export async function afterResponse(work: () => Promise<unknown>): Promise<void> {
  const safe = async () => {
    try {
      await work();
    } catch {
      // By contract `work` reports its own failures.
    }
  };
  try {
    after(safe);
  } catch {
    await safe();
  }
}
