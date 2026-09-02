import { isAdminUser } from "./admin";
import { isAuthConfigured } from "./config";
import { verifySession } from "./dal";
import { adminRoutesAvailable } from "./host";

/**
 * The admin check every admin Server Action makes, in one place.
 *
 * Four action files had written this out for themselves — `partner-review`,
 * `partner-activation`, `product-review` and `orders`, each with its own
 * `requireAdminSession` doing the same three things in the same order. That was
 * fine while there were three things. It stopped being fine the moment a fourth
 * was added: a hostname check that four files have to remember is a hostname
 * check that one of them will eventually be written without.
 *
 * A Server Action is a public HTTP endpoint. The page that renders the form is
 * not its gate — anyone can POST to the action's id from anywhere — which is
 * why this is re-checked here rather than trusted from the page that called it.
 *
 * Returns `null` rather than throwing, because these actions answer with a
 * typed `{ ok: false, reason: "forbidden" }` that the form renders. `notFound()`
 * is the right answer for a *page* that should not admit it exists; it is the
 * wrong answer inside a form submission, which needs to come back and say so.
 */
export async function adminSession() {
  // Auth not configured at all — a supported state, not a broken one.
  if (!isAuthConfigured()) return null;

  // The console does not exist on this hostname. Same rule as `requireAdmin`,
  // and checked first for the same reason.
  if (!(await adminRoutesAvailable())) return null;

  const session = await verifySession();
  if (!session || !isAdminUser(session)) return null;

  return session;
}
