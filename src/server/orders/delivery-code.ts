import { randomInt, timingSafeEqual } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { getPrisma } from "@/server/db/client";
import { moveOrderInTx, partnerOwnedOrder, type TransitionBlocker } from "./status";
import type { PartnerOrderScope } from "./tracking";

/**
 * Delivery confirmed by a code the customer holds.
 *
 * ## Why
 *
 * MalFleks's promise is "your money is held until your order arrives". Until
 * 5 Oct 2026 "arrived" was whatever the seller said: the branch pressed
 * "Mark delivered", and that same press made the branch payable. A seller
 * could be paid for an order that never left the shop, and the customer's only
 * protection was to complain afterwards.
 *
 * The owner's call that day: the two people who actually see the goods change
 * hands confirm it. The customer is given a six-digit code when they pay (on
 * their order page, in the receipt email, and by SMS). They say it to whoever
 * is at their door, **once the goods are in their hands**. The branch or
 * courier types it into `/partner/orders`, and only a matching code moves the
 * order to `fulfilled` -- which is what splits the money and, when automatic
 * payouts are armed, sends it.
 *
 * So neither side can take from the other: the seller cannot be paid without
 * the customer's code, and the customer cannot receive goods and withhold the
 * code without the courier simply not handing them over.
 *
 * ## What happens when the code cannot be entered
 *
 * A dead phone, a lost code, a customer who took the goods and will not say
 * it. The partner reports it with a reason (`reportDeliveryProblem`). That
 * moves nothing and pays nobody; it puts the order in front of an admin, who
 * rings the customer and then either marks it delivered or cancels and
 * refunds (the owner's choice of fallback, 5 Oct 2026).
 *
 * ## Guessing
 *
 * Six digits is a million possibilities. A wrong entry is counted on the
 * order: five wrong in a row pause entry for fifteen minutes, fifteen in total
 * lock it until an admin has looked. Attempts for one order are serialised by
 * a row lock, so a burst of parallel guesses is still counted one at a time.
 * At that rate a determined partner gets fifteen guesses at a
 * one-in-a-million code, and an admin is told when they have used them.
 */

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

export const DELIVERY_CODE_LENGTH = 6;
/** Wrong entries in a row before entry is paused. */
export const WRONG_BEFORE_PAUSE = 5;
export const PAUSE_MINUTES = 15;
/** Wrong entries in total before only an admin can settle the order. */
export const WRONG_BEFORE_LOCK = 15;

/** What is written on the order when the customer's code confirmed it. */
export const DELIVERY_CODE_NOTE = "Customer's delivery code entered";

/** A fresh code. `randomInt` is the cryptographic generator, not `Math.random`. */
export function generateDeliveryCode(): string {
  return String(randomInt(0, 10 ** DELIVERY_CODE_LENGTH)).padStart(DELIVERY_CODE_LENGTH, "0");
}

/**
 * What somebody typed, as six digits -- or `null` if it is not a code at all.
 *
 * Spaces and dashes are dropped because people read numbers aloud in groups
 * ("four eight two, nine one three") and type them the way they heard them. A
 * string that is not six digits is refused before it is ever compared, and
 * does **not** count as a wrong attempt: a slip of the thumb is not a guess.
 */
export function normaliseDeliveryCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s\-.]/g, "");
  return new RegExp(`^\\d{${DELIVERY_CODE_LENGTH}}$`).test(digits) ? digits : null;
}

/** Constant-time, so how long a wrong answer takes says nothing about how wrong it was. */
export function deliveryCodesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * What a wrong entry does, given how many wrong entries there now are --
 * pure, so the whole schedule is testable without a clock or a database.
 */
export function afterWrongAttempt(
  wrongAttempts: number,
  now: Date,
): { lockedUntil: Date | null; adminOnly: boolean; triesLeft: number } {
  if (wrongAttempts >= WRONG_BEFORE_LOCK) return { lockedUntil: null, adminOnly: true, triesLeft: 0 };
  const sinceLastPause = wrongAttempts % WRONG_BEFORE_PAUSE;
  if (sinceLastPause === 0) {
    return {
      lockedUntil: new Date(now.getTime() + PAUSE_MINUTES * 60_000),
      adminOnly: false,
      triesLeft: 0,
    };
  }
  return { lockedUntil: null, adminOnly: false, triesLeft: WRONG_BEFORE_PAUSE - sinceLastPause };
}

/**
 * The order's code, created if it has none. Safe to call any number of times
 * and from two places at once: the row's primary key is the order, so a second
 * insert is skipped and both callers read the one code that won.
 */
export async function ensureDeliveryCode(db: Db, orderId: string): Promise<string> {
  await db.deliveryCode.createMany({
    data: [{ orderId, code: generateDeliveryCode() }],
    skipDuplicates: true,
  });
  const row = await db.deliveryCode.findUnique({ where: { orderId }, select: { code: true } });
  // Unreachable: the row was just inserted or already existed, and nothing deletes one.
  if (!row) throw new Error(`DeliveryCode for order ${orderId} vanished after being ensured`);
  return row.code;
}

/**
 * Every code this customer should currently be able to see, by order
 * reference: their orders that are paid for and not yet delivered or
 * cancelled.
 *
 * `customerId` is in the `WHERE`, so this can only ever return the caller's
 * own codes. An order paid for before codes existed gets one here, the first
 * time its owner looks -- otherwise it would be an order nobody could confirm.
 */
export async function deliveryCodesForCustomer(customerId: string): Promise<Map<string, string>> {
  const db = getPrisma();
  const orders = await db.order.findMany({
    where: { customerId, status: "confirmed", payments: { some: { status: "captured" } } },
    select: { id: true, reference: true, deliveryCode: { select: { code: true } } },
  });

  const codes = new Map<string, string>();
  for (const order of orders) {
    codes.set(order.reference, order.deliveryCode?.code ?? (await ensureDeliveryCode(db, order.id)));
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Entering the code
// ---------------------------------------------------------------------------

export type ConfirmDeliveryOutcome =
  | { ok: true }
  | { ok: false; reason: TransitionBlocker | "not-paid" | "bad-code" | "locked-admin" }
  | { ok: false; reason: "wrong-code"; triesLeft: number; lockedUntil: string | null; adminOnly: boolean }
  | { ok: false; reason: "locked"; lockedUntil: string };

/**
 * The branch or courier enters the code the customer just told them.
 *
 * Ownership first (someone else's order reads as `not-found`), then paid, then
 * the code. Everything from "is it locked" to "the order is now delivered"
 * happens in one transaction under a lock on the order's `DeliveryCode` row:
 *
 * - two phones entering the right code at once deliver the order once;
 * - a burst of wrong guesses is counted one at a time, so none slip past the
 *   limit;
 * - a matching code and a moved order commit together or not at all.
 *
 * A wrong code commits its count and returns -- it is an answer, not an
 * error, so the transaction is not rolled back.
 */
export async function confirmDeliveryWithCode(
  orderId: string,
  scope: PartnerOrderScope,
  actorUid: string,
  rawCode: unknown,
  now: Date = new Date(),
): Promise<ConfirmDeliveryOutcome> {
  const own = await partnerOwnedOrder(orderId, scope);
  if (!own) return { ok: false, reason: "not-found" };
  if (!own.paid) return { ok: false, reason: "not-paid" };
  if (own.status !== "confirmed") return { ok: false, reason: "invalid-transition" };

  const given = normaliseDeliveryCode(rawCode);
  if (!given) return { ok: false, reason: "bad-code" };

  const db = getPrisma();
  // An order paid for before codes existed: give it one, so there is a row to
  // lock. Its owner sees it on their order page (`deliveryCodesForCustomer`).
  await ensureDeliveryCode(db, own.id);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "DeliveryCode" WHERE "orderId" = ${own.id} FOR UPDATE`;
    const row = await tx.deliveryCode.findUnique({
      where: { orderId: own.id },
      select: { code: true, wrongAttempts: true, lockedUntil: true, usedAt: true },
    });
    if (!row) return { ok: false, reason: "not-found" } as const;
    if (row.usedAt) return { ok: false, reason: "invalid-transition" } as const;
    if (row.wrongAttempts >= WRONG_BEFORE_LOCK) return { ok: false, reason: "locked-admin" } as const;
    if (row.lockedUntil && row.lockedUntil > now) {
      return { ok: false, reason: "locked", lockedUntil: row.lockedUntil.toISOString() } as const;
    }

    if (!deliveryCodesMatch(row.code, given)) {
      const wrongAttempts = row.wrongAttempts + 1;
      const next = afterWrongAttempt(wrongAttempts, now);
      await tx.deliveryCode.update({
        where: { orderId: own.id },
        data: { wrongAttempts, lockedUntil: next.lockedUntil },
      });
      return {
        ok: false,
        reason: "wrong-code",
        triesLeft: next.triesLeft,
        lockedUntil: next.lockedUntil ? next.lockedUntil.toISOString() : null,
        adminOnly: next.adminOnly,
      } as const;
    }

    const moved = await moveOrderInTx(tx, own.id, "fulfilled", actorUid, DELIVERY_CODE_NOTE);
    if (!moved.ok) return moved;

    await tx.deliveryCode.update({
      where: { orderId: own.id },
      data: { usedAt: now, usedBy: actorUid, lockedUntil: null },
    });
    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------
// "I can't enter the code"
// ---------------------------------------------------------------------------

export const PROBLEM_NOTE_MIN = 10;
export const PROBLEM_NOTE_MAX = 500;

export type ReportProblemOutcome =
  | { ok: true }
  | { ok: false; reason: TransitionBlocker | "not-paid" | "note-required" | "already-reported" };

/**
 * The partner says the delivery happened (or could not) and the code cannot
 * be entered. Recorded once per order, with their words.
 *
 * **This moves nothing.** The order stays `confirmed`, nobody becomes payable,
 * and the code keeps working if the customer turns up with it a minute later.
 * All it does is make the order an admin's to settle.
 */
export async function reportDeliveryProblem(
  orderId: string,
  scope: PartnerOrderScope,
  actorUid: string,
  rawNote: unknown,
  now: Date = new Date(),
): Promise<ReportProblemOutcome> {
  const own = await partnerOwnedOrder(orderId, scope);
  if (!own) return { ok: false, reason: "not-found" };
  if (!own.paid) return { ok: false, reason: "not-paid" };
  if (own.status !== "confirmed") return { ok: false, reason: "invalid-transition" };

  const note = typeof rawNote === "string" ? rawNote.trim().slice(0, PROBLEM_NOTE_MAX) : "";
  if (note.length < PROBLEM_NOTE_MIN) return { ok: false, reason: "note-required" };

  const db = getPrisma();
  await ensureDeliveryCode(db, own.id);
  // Guarded on "not yet reported": the first report stands, with its time and
  // its words, and a second press cannot rewrite it.
  const { count } = await db.deliveryCode.updateMany({
    where: { orderId: own.id, problemAt: null, usedAt: null },
    data: { problemAt: now, problemBy: actorUid, problemNote: note },
  });
  return count === 1 ? { ok: true } : { ok: false, reason: "already-reported" };
}

// ---------------------------------------------------------------------------
// What other pages may know about a code, without knowing the code
// ---------------------------------------------------------------------------

/** For the partner's order card. Never includes the code itself. */
export interface DeliveryCodeState {
  /** Entry is paused until this time (ISO), after five wrong codes in a row. */
  lockedUntil: string | null;
  /** Fifteen wrong codes: only MalFleks can settle the order now. */
  adminOnly: boolean;
  /** The partner has said they cannot enter the code. */
  problemReported: boolean;
}

export function deliveryCodeState(
  row: { wrongAttempts: number; lockedUntil: Date | null; problemAt: Date | null } | null | undefined,
  now: Date = new Date(),
): DeliveryCodeState {
  return {
    lockedUntil: row?.lockedUntil && row.lockedUntil > now ? row.lockedUntil.toISOString() : null,
    adminOnly: (row?.wrongAttempts ?? 0) >= WRONG_BEFORE_LOCK,
    problemReported: Boolean(row?.problemAt),
  };
}

/** Orders an admin has to settle because the code could not confirm them. */
export interface DeliveryProblemWork {
  count: number;
  oldest: Date | null;
  orders: { orderId: string; reference: string; since: Date; why: "reported" | "locked" }[];
}

export async function deliveryProblemWork(db: Db = getPrisma()): Promise<DeliveryProblemWork> {
  const rows = await db.deliveryCode.findMany({
    where: {
      usedAt: null,
      order: { status: "confirmed" },
      OR: [{ problemAt: { not: null } }, { wrongAttempts: { gte: WRONG_BEFORE_LOCK } }],
    },
    select: { orderId: true, problemAt: true, createdAt: true, order: { select: { reference: true } } },
    orderBy: { problemAt: "asc" },
  });
  const orders = rows.map((r) => ({
    orderId: r.orderId,
    reference: r.order.reference,
    since: r.problemAt ?? r.createdAt,
    why: r.problemAt ? ("reported" as const) : ("locked" as const),
  }));
  return {
    count: orders.length,
    oldest: orders.reduce<Date | null>((min, o) => (!min || o.since < min ? o.since : min), null),
    orders,
  };
}
