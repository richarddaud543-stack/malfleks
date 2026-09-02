import type { Prisma, PrismaClient } from "@prisma/client";

import type { OrderRequest } from "@/lib/order";
import { getPrisma } from "@/server/db/client";
import { databaseCatalogueFor } from "./catalogue-source";
import {
  buildOrderRequest,
  sanitizeReference,
  sanitizeRequestedAt,
  type BuildResult,
  type SaveOrderRequestFailure,
  type SaveOrderRequestInput,
} from "./build-order-request";

/**
 * A signed-in customer's saved order requests.
 *
 * ## This used to live in Firestore
 *
 * The original argument for keeping it out of Postgres was that it was a
 * user-scoped, non-relational slice keyed by a Firebase uid, and that mirroring
 * Firebase uids into a second store would buy nothing. That argument was sound
 * and it died with Firebase: there is no second store any more. It is now one
 * table in the database that already holds everything else.
 *
 * Three things got better in the move, and they are worth naming because they
 * are the reason this file is shorter than the one it replaces:
 *
 * 1. **Ownership is a `WHERE` clause, not a path.** Firestore's
 *    `collection.doc(id)` accepts a *path* — `doc("a/b/c")` addresses a nested
 *    document — so an id taken from the browser could step outside the
 *    customer's own subcollection, and the old code carried an
 *    `isValidRequestId` regex specifically to stop that. Here a foreign id
 *    matches zero rows. The injection surface is gone rather than guarded.
 * 2. **Delete is one guarded statement.** Firestore's `delete()` succeeds on a
 *    document that was never there, so the old path had to read first and then
 *    delete — two round trips with a race between them. `deleteMany` reports
 *    how many rows it matched, which answers both questions at once. This is
 *    the same discipline `writeTransition` uses on order status.
 * 3. **No server-timestamp limbo.** `savedAt` was a Firestore sentinel that
 *    read back as `null` for the instant between the write being acknowledged
 *    and the timestamp materialising, and every reader had to handle it.
 *    Postgres writes the value in the same statement.
 *
 * This remains an **addition** on top of every order request also being
 * persisted as an `Order` (`./create-order.ts`), not a replacement for it. The
 * distinction is lifecycle: an `Order` is Soko's operational record and must
 * survive, while this is the customer's own copy and the whole point of it is
 * that they can delete it. `prisma/schema.prisma` says the same on the model.
 *
 * `buildOrderRequest` — the trust-boundary rebuild every persistence path
 * shares — lives in `./build-order-request`; re-exported here so nothing that
 * imported it from this module has to change.
 */
export {
  buildOrderRequest,
  sanitizeReference,
  sanitizeRequestedAt,
  type BuildResult,
  type SaveOrderRequestFailure,
  type SaveOrderRequestInput,
};

/**
 * The most saved requests one customer may hold.
 *
 * A signed-in customer can call the save action in a loop. Firestore billed per
 * write, which made an unbounded write path a billing incident waiting for
 * someone bored; Postgres does not bill that way, so the reason has changed
 * rather than disappeared. What is left is disk and a list view that stops
 * being usable long before it stops being cheap. This is a ceiling, not a rate
 * limit — see docs/auth.md for what is still missing.
 */
export const MAX_SAVED_REQUESTS_PER_CUSTOMER = 200;

export type SaveOutcome =
  | { saved: true; id: string; reference: string }
  | { saved: false; reason: SaveOrderRequestFailure };

export interface SavedOrderRequest extends OrderRequest {
  id: string;
  /** ISO string. Always present — Postgres writes it in the same statement. */
  savedAt: string;
}

/**
 * Writes one request for one customer.
 *
 * `customerId` comes from the verified session and never from the payload.
 * That, and only that, is what makes the row this customer's.
 *
 * The quota check and the insert are wrapped in a transaction so two rapid
 * submissions cannot both read 199 and both write. It is not a strict
 * serialisation guarantee — two transactions at READ COMMITTED can still each
 * see 199 — but it closes the window to something a bored human cannot hit,
 * and the ceiling is a courtesy rather than a security boundary.
 */
export async function saveOrderRequestForCustomer(
  customerId: string,
  input: SaveOrderRequestInput,
  db: PrismaClient = getPrisma(),
): Promise<SaveOutcome> {
  // Same reasoning as `createOrder`: the catalogue is in Postgres now, and a
  // customer saving a partner's product must not be told it does not exist.
  const catalogue = await databaseCatalogueFor(input.productId);

  const built = buildOrderRequest(input, undefined, catalogue);
  if (!built.ok) return { saved: false, reason: built.reason };

  return db.$transaction(async (tx) => {
    const existing = await tx.savedOrderRequest.count({ where: { customerId } });
    if (existing >= MAX_SAVED_REQUESTS_PER_CUSTOMER) {
      return { saved: false, reason: "quota" } as const;
    }

    const row = await tx.savedOrderRequest.create({
      data: {
        customerId,
        reference: built.value.reference,
        requestedAt: new Date(built.value.requestedAt),
        payload: built.value as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return { saved: true, id: row.id, reference: built.value.reference } as const;
  });
}

/**
 * A customer's saved requests, newest first.
 *
 * Ordered by `requestedAt` — what the customer saw — rather than `savedAt`,
 * matching the order the Firestore version returned and the order a person
 * expects when they scan their own list.
 */
export async function listOrderRequestsForCustomer(
  customerId: string,
  limit: number = 50,
  db: PrismaClient = getPrisma(),
): Promise<SavedOrderRequest[]> {
  const rows = await db.savedOrderRequest.findMany({
    where: { customerId },
    orderBy: { requestedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    ...(row.payload as unknown as OrderRequest),
    id: row.id,
    savedAt: row.savedAt.toISOString(),
  }));
}

export type DeleteOutcome =
  | { deleted: true }
  | { deleted: false; reason: "invalid-id" | "not-found" };

/**
 * Whether an id is even shaped like one we hand out.
 *
 * Kept — with a much smaller job than it had. Under Firestore this was a
 * security control, because an id could be a path. Here it is only an early
 * exit: `deleteMany` would return zero for a malformed id anyway, and the
 * caller would see `not-found`. Distinguishing the two still helps, because
 * "invalid-id" means a bug in our own client and "not-found" means a stale
 * tab, and those want different responses.
 *
 * Prisma's `cuid()` is 25 characters starting with `c`. The check is
 * deliberately loose about the exact length so a Prisma version that adjusts
 * its generator does not turn every delete into a false `invalid-id`.
 */
export function isValidRequestId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9]{20,32}$/.test(id);
}

/**
 * Removes one saved request, permanently.
 *
 * A hard delete rather than a soft one, and the reason survives the move off
 * Firestore unchanged: nothing is transmitted to the branch and nothing is
 * charged, so there is no counterparty holding the other half of this record
 * and no dispute it could ever settle. What a retained shell would preserve is
 * a name, a phone number and a home address kept after the person asked us to
 * stop keeping them.
 *
 * `customerId` comes from the verified session, and it is in the `WHERE`. An id
 * belonging to another customer matches nothing and reads as `not-found` — it
 * cannot delete their row, and the response does not confirm the row exists.
 */
export async function deleteOrderRequestForCustomer(
  customerId: string,
  id: string,
  db: PrismaClient = getPrisma(),
): Promise<DeleteOutcome> {
  if (!isValidRequestId(id)) return { deleted: false, reason: "invalid-id" };

  const { count } = await db.savedOrderRequest.deleteMany({
    where: { id, customerId },
  });

  return count > 0 ? { deleted: true } : { deleted: false, reason: "not-found" };
}
