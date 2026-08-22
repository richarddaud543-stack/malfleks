import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getBranchById, getBrandById, getProductById } from "@/data";
import {
  createOrderRequest,
  orderBlockReason,
  resolveDeliveryRoute,
  validateOrderRequest,
  type OrderRequest,
} from "@/lib/order";
import { getAdminFirestore } from "@/server/firebase/admin";

/**
 * A signed-in customer's saved order requests.
 *
 * Why Firestore and not Prisma: `docs/backend.md` settles that Prisma owns the
 * catalogue and names the one exception worth revisiting — a genuinely
 * user-scoped, realtime-shaped slice. This is that slice. It is keyed by
 * Firebase uid, it is not relational, nothing joins it to the catalogue, and
 * the identity that owns it already lives in Firebase. Putting it in Postgres
 * would mean mirroring Firebase uids into a second store for no gain. The
 * decision is recorded in `docs/backend.md` under the original one.
 *
 * Path: `customers/{uid}/orderRequests/{autoId}`. Ownership is a path segment
 * compared against `request.auth.uid` in `firestore.rules`, not a field — see
 * that file for why.
 */

/**
 * What the browser is allowed to send.
 *
 * Deliberately narrow. The browser sends *which product* and *who the customer
 * is*, never the price, the product name, the carrier or the line total. Those
 * are re-derived here from the catalogue, so a hand-crafted request cannot
 * store a BMW at 5,000 TZS or invent a delivery agent. This is the single most
 * important property of this module.
 */
export interface SaveOrderRequestInput {
  productId: string;
  quantity: string;
  fullName: string;
  phone: string;
  address: string;
  agentId: string | null;
  /** The reference the customer already has on screen, so both copies match. */
  reference: string;
  requestedAt: string;
}

export type SaveOrderRequestFailure =
  | "unknown-product"
  | "catalogue-mismatch"
  | "not-orderable"
  | "invalid"
  | "quota";

export type BuildResult =
  | { ok: true; value: OrderRequest }
  | { ok: false; reason: SaveOrderRequestFailure };

/**
 * The most saved requests one customer may hold.
 *
 * A signed-in customer can call the save action in a loop. Firestore bills per
 * write and the free tier is 20,000 writes/day for the whole project, so an
 * unbounded per-user write path is a billing incident waiting for someone
 * bored. This is a ceiling, not a rate limit — see docs/auth.md for what is
 * still missing.
 */
export const MAX_SAVED_REQUESTS_PER_CUSTOMER = 200;

/**
 * References are read down the phone, so they use a restricted alphabet with
 * no 0/O/1/I/L/S/B/2. Anything not of that shape is a client that has been
 * edited; we replace it rather than reject the order, because the reference is
 * cosmetic and losing the whole request over it would be the wrong trade.
 */
const REFERENCE_PATTERN = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[ACDEFGHJKMNPQRTUVWXY3456789]{4}$/;

export function sanitizeReference(raw: unknown): string | undefined {
  return typeof raw === "string" && REFERENCE_PATTERN.test(raw) ? raw : undefined;
}

/** A day either side of now. Anything else is a clock we should not trust. */
const REQUESTED_AT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function sanitizeRequestedAt(
  raw: unknown,
  nowMs: number = Date.now()
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return undefined;
  if (Math.abs(parsed - nowMs) > REQUESTED_AT_WINDOW_MS) return undefined;
  return new Date(parsed).toISOString();
}

/**
 * Rebuilds the order request server-side from the catalogue.
 *
 * Pure: no Firestore, no session, no clock beyond what is injected. This is
 * where the trust boundary actually is, so it is the part with tests.
 */
export function buildOrderRequest(
  input: SaveOrderRequestInput,
  nowMs: number = Date.now()
): BuildResult {
  const product = getProductById(input.productId);
  if (!product) return { ok: false, reason: "unknown-product" };

  const branch = getBranchById(product.branchId);
  const brand = getBrandById(product.brandId);
  // The catalogue asserts these agree at seed time. If they ever do not, this
  // is a corrupt record rather than a bad request, and storing half of it
  // would be worse than storing none.
  if (!branch || !brand) return { ok: false, reason: "catalogue-mismatch" };

  const route = resolveDeliveryRoute(branch);
  if (orderBlockReason(product, route)) {
    return { ok: false, reason: "not-orderable" };
  }

  // The same validator the form runs, run again on the server. The client's
  // copy is a convenience for the customer; this one is the one that counts.
  const validated = validateOrderRequest(
    {
      quantity: input.quantity,
      fullName: input.fullName,
      phone: input.phone,
      address: input.address,
      agentId: input.agentId,
    },
    route
  );
  if (!validated.ok) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    value: createOrderRequest({
      product,
      brand,
      branch,
      order: validated.value,
      reference: sanitizeReference(input.reference),
      requestedAt: sanitizeRequestedAt(input.requestedAt, nowMs),
    }),
  };
}

function collection(uid: string) {
  return getAdminFirestore().collection("customers").doc(uid).collection("orderRequests");
}

export type SaveOutcome =
  | { saved: true; id: string; reference: string }
  | { saved: false; reason: SaveOrderRequestFailure };

/**
 * Writes one request for one customer.
 *
 * `uid` comes from the verified session cookie and never from the payload —
 * that is what makes the path safe. Auto-generated document ids are used on
 * purpose: Firestore shards by key range, so timestamp- or counter-prefixed
 * ids put every new write on the same shard. Its own generated ids scatter.
 */
export async function saveOrderRequestForCustomer(
  uid: string,
  input: SaveOrderRequestInput
): Promise<SaveOutcome> {
  const built = buildOrderRequest(input);
  if (!built.ok) return { saved: false, reason: built.reason };

  const requests = collection(uid);

  // One aggregation read rather than fetching the documents to count them.
  const existing = await requests.count().get();
  if (existing.data().count >= MAX_SAVED_REQUESTS_PER_CUSTOMER) {
    return { saved: false, reason: "quota" };
  }

  const doc = requests.doc();
  await doc.set({
    ...built.value,
    // Redundant with the path, and kept anyway: an export, an audit query or a
    // collection-group read all lose the path but keep the fields.
    customerId: uid,
    // The server's clock, not the browser's. `requestedAt` is what the customer
    // saw; this is when it actually landed.
    savedAt: FieldValue.serverTimestamp(),
  });

  return { saved: true, id: doc.id, reference: built.value.reference };
}

export interface SavedOrderRequest extends OrderRequest {
  id: string;
  /** ISO string, or `null` while the server timestamp is still resolving. */
  savedAt: string | null;
}

/**
 * A customer's saved requests, newest first.
 *
 * `savedAt` is a server timestamp, which reads back as `null` for the instant
 * between the write being acknowledged and the timestamp being materialised.
 * Ordering falls back to `requestedAt`, which is always present.
 */
export async function listOrderRequestsForCustomer(
  uid: string,
  limit: number = 50
): Promise<SavedOrderRequest[]> {
  const snapshot = await collection(uid)
    .orderBy("requestedAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const savedAt = data.savedAt;
    return {
      ...(data as OrderRequest),
      id: doc.id,
      savedAt: savedAt instanceof Timestamp ? savedAt.toDate().toISOString() : null,
    };
  });
}

/**
 * A Firestore auto-generated document id: 20 characters of `[A-Za-z0-9]`.
 *
 * This is a security check, not a tidiness one. `collection.doc(id)` happily
 * accepts a *path* — `doc("a/b/c")` addresses a nested document — so an id
 * taken from the browser and passed straight through could step outside the
 * customer's own subcollection. Every id we hand out is one Firestore
 * generated in `saveOrderRequestForCustomer`, so anything else is a forged
 * request and gets no further.
 */
export function isValidRequestId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9]{20}$/.test(id);
}

export type DeleteOutcome =
  | { deleted: true }
  | { deleted: false; reason: "invalid-id" | "not-found" };

/**
 * The half of the delete path that does not need a real Firestore.
 *
 * Split out for the same reason `buildOrderRequest` is pure: the part worth
 * testing is the decision — is this id even ours to look at, and did it exist —
 * not the network call underneath. Mirrors `buildListings`/`getListings`.
 */
export interface RequestDocument {
  get(): Promise<{ exists: boolean }>;
  delete(): Promise<unknown>;
}

export interface RequestCollection {
  doc(id: string): RequestDocument;
}

export async function deleteFromCollection(
  requests: RequestCollection,
  id: string
): Promise<DeleteOutcome> {
  if (!isValidRequestId(id)) return { deleted: false, reason: "invalid-id" };

  const doc = requests.doc(id);

  // Read before delete. Firestore's `delete()` succeeds on a document that was
  // never there, so without this the UI would cheerfully report "removed" for
  // an id that belonged to somebody else — telling the caller nothing about
  // whether it existed, which is its own small information leak.
  const snapshot = await doc.get();
  if (!snapshot.exists) return { deleted: false, reason: "not-found" };

  await doc.delete();
  return { deleted: true };
}

/**
 * Removes one saved request, permanently.
 *
 * A hard delete rather than the soft delete debt #20 first proposed, and the
 * reason is that the "evidence" argument in `firestore.rules` does not survive
 * contact with what Soko actually does. Nothing is transmitted to the branch
 * and nothing is charged, so there is no counterparty holding the other half
 * of this record and no dispute it could ever settle. What is left is a name,
 * a phone number and a home address kept after the person asked us to stop
 * keeping them. Redacting the fields and retaining a shell would be the right
 * shape if a branch had ever been told; today it just means the deletion is
 * not quite a deletion.
 *
 * `uid` comes from the verified session, so the path is the authorization:
 * a customer can only ever address their own subcollection, and an id from
 * another customer's reads as `not-found` rather than deleting anything.
 */
export async function deleteOrderRequestForCustomer(
  uid: string,
  id: string
): Promise<DeleteOutcome> {
  return deleteFromCollection(collection(uid), id);
}
