import { brands } from "@/data";
import {
  validatePartnerApplication,
  type PartnerApplicationInput,
  type ValidatedPartnerApplication,
} from "@/lib/partner-application";
import { getPrisma } from "@/server/db/client";

/**
 * Partner applications — the intake half of the pipeline in
 * `docs/marketplace-model.md`.
 *
 * Split the same way `buildOrderRequest` / `saveOrderRequestForCustomer` are in
 * `orders/saved-requests.ts`: the decision is pure and tested, the write is a
 * thin wrapper over it. The part worth testing is whether a hand-crafted form
 * can get something past us, not whether Prisma can insert a row.
 */

export type ApplicationFailure = "invalid" | "quota";

export type BuildResult =
  | { ok: true; value: ValidatedPartnerApplication }
  | { ok: false; reason: ApplicationFailure };

/**
 * The most pending applications one account may hold.
 *
 * A signed-in visitor can call the action in a loop, and each call is a row.
 * This bounds the damage; it is a ceiling rather than a rate limit, the same
 * distinction as `MAX_SAVED_REQUESTS_PER_CUSTOMER`. Only *pending* rows count,
 * so somebody legitimately applying for a second branch after the first was
 * approved is not blocked by their own history.
 */
export const MAX_PENDING_APPLICATIONS_PER_USER = 5;

/**
 * Re-runs the browser's validation on the server, against the real catalogue.
 *
 * Pure: no database, no session. `knownBrandIds` comes from the seed data
 * rather than a query because the brand list is small, static, and the same
 * source the form was rendered from.
 */
export function buildPartnerApplication(
  input: PartnerApplicationInput
): BuildResult {
  const validated = validatePartnerApplication(
    input,
    brands.map((b) => b.id)
  );
  if (!validated.ok) return { ok: false, reason: "invalid" };
  return { ok: true, value: validated.value };
}

export type SubmitOutcome =
  | { submitted: true; id: string }
  | { submitted: false; reason: ApplicationFailure };

/**
 * Records one application for one signed-in account.
 *
 * `uid` and `email` are taken from the verified session by the caller and never
 * from the payload — that is what makes the eventual promotion to `PartnerUser`
 * trustworthy, because the account that applied is provably the account that
 * gets the partner role.
 */
export async function createApplicationForUser(
  uid: string,
  email: string,
  input: PartnerApplicationInput
): Promise<SubmitOutcome> {
  const built = buildPartnerApplication(input);
  if (!built.ok) return { submitted: false, reason: built.reason };

  const db = getPrisma();

  const pending = await db.partnerApplication.count({
    where: { uid, status: "pending" },
  });
  if (pending >= MAX_PENDING_APPLICATIONS_PER_USER) {
    return { submitted: false, reason: "quota" };
  }

  const created = await db.partnerApplication.create({
    data: { ...built.value, uid, email },
    select: { id: true },
  });

  return { submitted: true, id: created.id };
}
