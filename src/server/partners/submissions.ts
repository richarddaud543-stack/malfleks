import { getPrisma } from "@/server/db/client";

/**
 * Product submissions — a branch partner proposes a product, an admin
 * publishes it.
 *
 * This is the step that reverses debt #8. Today `src/data` is the editorial
 * source and `seedDatabase` mirrors it into the database; once branches submit
 * here and admins publish, **the database becomes the source of truth** and the
 * static arrays drop to seed and demo fixtures. `docs/marketplace-model.md` §3
 * describes it; this module is the server half.
 *
 * Built in the same shape as `./review.ts`: the decision is pure and
 * exhaustively testable, and the write is a thin guarded transaction over it.
 * That flow already found and fixed a real approve/reject race, and publishing
 * is the same class of operation — an irreversible step two admin tabs can
 * reach at once.
 *
 * **Nothing here is customer-visible until `publishSubmission` succeeds.** A
 * submission is a proposal, and a pending one appears nowhere a customer looks.
 */

/** What an admin sees in the review queue. Trimmed to what the page renders. */
export interface ReviewableSubmission {
  id: string;
  status: string;
  partnerId: string | null;
  branchId: string | null;
  brandId: string | null;
  name: string;
  category: string;
  priceTZS: number;
  image: string;
  description: string;
  inStock: boolean;
  specs: Array<{ key: string; value: string }>;
  createdAt: string;
  reviewedAt: string | null;
  decisionNote: string | null;
  publishedProductId: string | null;
}

export interface SubmitProductInput {
  name: string;
  category: string;
  /** Whole shillings. A string from a form is parsed by the caller, not here. */
  priceTZS: number;
  image: string;
  description: string;
  inStock?: boolean;
  specs?: Array<{ key: string; value: string }>;
}

export type SubmitBlocker =
  | "not-a-partner"
  | "not-a-branch-partner"
  | "partner-suspended"
  | "invalid-price"
  | "missing-field";

export type SubmitOutcome =
  | { ok: true; value: { id: string } }
  | { ok: false; reason: SubmitBlocker };

export type PublishBlocker =
  | "not-found"
  | "already-reviewed"
  | "no-branch"
  | "slug-taken";

export type PublishCheck = { ok: true } | { ok: false; reason: PublishBlocker };

export type PublishOutcome =
  | { ok: true; value: { productId: string } }
  | { ok: false; reason: PublishBlocker };

export type RejectOutcome =
  | { ok: true }
  | { ok: false; reason: "not-found" | "already-reviewed" };

/**
 * Whether a submission may be published — pure, so both directions are cheap
 * to test without a database.
 *
 * `slugTaken` is whether the slug this submission would claim already belongs
 * to a live product. `Product.slug` is `@unique`, so publishing anyway would
 * throw a constraint violation from deep inside Prisma; answering it here means
 * the admin reads a sentence instead of a stack trace.
 */
export function canPublish(
  submission: { status: string; branchId: string | null } | null,
  slugTaken: boolean,
): PublishCheck {
  if (!submission) return { ok: false, reason: "not-found" };
  if (submission.status !== "pending") {
    return { ok: false, reason: "already-reviewed" };
  }
  // A submission whose partner was never wired to a `Branch` has nowhere to
  // publish to. `Product.branchId` is required and the order flow routes an
  // order back to the exact branch that listed it — a product with no branch
  // would be unorderable, which is worse than an unpublished one.
  if (!submission.branchId) return { ok: false, reason: "no-branch" };
  if (slugTaken) return { ok: false, reason: "slug-taken" };
  return { ok: true };
}

/**
 * The slug a submitted product would claim.
 *
 * Derived from the name rather than accepted from the submitter: a slug is a
 * URL and `Product.slug` is unique, so letting a branch choose one lets a
 * branch squat another's. Matches the shape of the slugs already in
 * `src/data/products.ts`.
 */
export function slugForSubmission(name: string, branchId: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const scope = branchId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Scoped by branch so two branches may both list "Corolla" without one
  // blocking the other. Still unique at the database, which is the real guard.
  return base === "" ? scope : `${scope}-${base}`;
}

/**
 * A branch partner proposes a product.
 *
 * **`branchId` and `brandId` are resolved from the partner on the server**,
 * never taken from the caller. This is the same trust boundary
 * `buildOrderRequest` holds for prices: the browser says *what* it wants
 * listed, never *which branch it is*. A `branchId` in a payload would let any
 * partner list a product under a competitor's branch, and orders route back to
 * whichever branch a product names.
 */
export async function submitProduct(
  partnerId: string,
  input: SubmitProductInput,
): Promise<SubmitOutcome> {
  const db = getPrisma();

  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { kind: true, status: true, branchId: true, brandId: true },
  });

  if (!partner) return { ok: false, reason: "not-a-partner" };
  if (partner.kind !== "brand") return { ok: false, reason: "not-a-branch-partner" };
  if (partner.status !== "active") return { ok: false, reason: "partner-suspended" };

  const name = input.name.trim();
  const category = input.category.trim();
  const description = input.description.trim();
  const image = input.image.trim();

  if (name === "" || category === "" || description === "" || image === "") {
    return { ok: false, reason: "missing-field" };
  }

  // Whole shillings only, and a positive one. `priceTZS Int` says so at the
  // database; saying it here means the partner gets told why.
  if (!Number.isInteger(input.priceTZS) || input.priceTZS <= 0) {
    return { ok: false, reason: "invalid-price" };
  }

  const specs = (input.specs ?? [])
    .map((spec) => ({ key: spec.key.trim(), value: spec.value.trim() }))
    .filter((spec) => spec.key !== "" && spec.value !== "");

  const created = await db.productSubmission.create({
    data: {
      partnerId,
      branchId: partner.branchId,
      brandId: partner.brandId,
      name,
      category,
      priceTZS: input.priceTZS,
      image,
      description,
      inStock: input.inStock ?? true,
      specs: {
        create: specs.map((spec, position) => ({ ...spec, position })),
      },
    },
    select: { id: true },
  });

  return { ok: true, value: { id: created.id } };
}

/** The admin queue reads pending-first, oldest-first. */
export async function listPendingSubmissions(): Promise<ReviewableSubmission[]> {
  const db = getPrisma();
  const rows = await db.productSubmission.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { specs: { orderBy: { position: "asc" } } },
  });
  return rows.map(mapSubmission);
}

function mapSubmission(row: {
  id: string;
  status: string;
  partnerId: string | null;
  branchId: string | null;
  brandId: string | null;
  name: string;
  category: string;
  priceTZS: number;
  image: string;
  description: string;
  inStock: boolean;
  createdAt: Date;
  reviewedAt: Date | null;
  decisionNote: string | null;
  publishedProductId: string | null;
  specs: Array<{ key: string; value: string }>;
}): ReviewableSubmission {
  return {
    id: row.id,
    status: row.status,
    partnerId: row.partnerId,
    branchId: row.branchId,
    brandId: row.brandId,
    name: row.name,
    category: row.category,
    priceTZS: row.priceTZS,
    image: row.image,
    description: row.description,
    inStock: row.inStock,
    specs: row.specs.map((s) => ({ key: s.key, value: s.value })),
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    publishedProductId: row.publishedProductId,
  };
}

/**
 * Publishes a submission: writes the live `Product` row and flips the
 * submission, in one transaction.
 *
 * The pre-check exists for the *message*, not the safety. The guarantee is the
 * `updateMany` with `status: "pending"` in the WHERE — never `update` by id —
 * so two admin tabs both clicking Publish resolve to exactly one published
 * product, not two rows and not a stack trace. That race is not hypothetical:
 * it was found in real code in this repo on 2026-08-23 and fixed once already.
 *
 * The flip happens **before** the product is created, deliberately. If the flip
 * loses the race the transaction returns early and no product is written; if it
 * wins, it has claimed the submission and the create that follows is the only
 * one that will ever run for it. `publishedProductId` is `@unique` as a second,
 * independent guard at the database.
 */
export async function publishSubmission(
  submissionId: string,
  adminUid: string,
): Promise<PublishOutcome> {
  const db = getPrisma();

  const submission = await db.productSubmission.findUnique({
    where: { id: submissionId },
    select: {
      status: true,
      branchId: true,
      brandId: true,
      name: true,
      category: true,
      priceTZS: true,
      image: true,
      description: true,
      inStock: true,
      specs: { orderBy: { position: "asc" as const } },
    },
  });

  if (!submission) return { ok: false, reason: "not-found" };
  if (!submission.branchId) {
    // Checked before the slug lookup, which needs a branch to scope by.
    const early = canPublish(submission, false);
    if (!early.ok) return early;
  }

  const branchId = submission.branchId;
  const slug = branchId ? slugForSubmission(submission.name, branchId) : "";
  const existing = branchId
    ? await db.product.findUnique({ where: { slug }, select: { id: true } })
    : null;

  const check = canPublish(submission, existing !== null);
  if (!check.ok) return check;

  return db.$transaction(async (tx) => {
    // Claim the submission first. Losing here means another tab already
    // published it, and nothing further may happen.
    const { count } = await tx.productSubmission.updateMany({
      where: { id: submissionId, status: "pending" },
      data: {
        status: "published",
        reviewedAt: new Date(),
        reviewedBy: adminUid,
      },
    });

    if (count === 0) {
      return { ok: false, reason: "already-reviewed" } as const;
    }

    // `sortOrder` puts a newly published product after everything the seed
    // laid down, so publishing never reorders the existing catalogue.
    const last = await tx.product.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const product = await tx.product.create({
      data: {
        id: `sub-${submissionId}`,
        slug,
        branchId: branchId as string,
        brandId: submission.brandId as string,
        name: submission.name,
        category: submission.category,
        priceTZS: submission.priceTZS,
        image: submission.image,
        description: submission.description,
        inStock: submission.inStock,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        specs: {
          create: submission.specs.map((spec, position) => ({
            key: spec.key,
            value: spec.value,
            position,
          })),
        },
      },
      select: { id: true },
    });

    await tx.productSubmission.update({
      where: { id: submissionId },
      data: { publishedProductId: product.id },
    });

    return { ok: true, value: { productId: product.id } } as const;
  });
}

/**
 * Rejects a submission. `note` is stored trimmed, or `null` if blank — the same
 * convention as `rejectApplication` and `cancelOrder`, so a reader learns one
 * vocabulary rather than three.
 */
export async function rejectSubmission(
  submissionId: string,
  adminUid: string,
  note: string,
): Promise<RejectOutcome> {
  const db = getPrisma();
  const trimmed = note.trim();

  const { count } = await db.productSubmission.updateMany({
    where: { id: submissionId, status: "pending" },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: adminUid,
      decisionNote: trimmed === "" ? null : trimmed,
    },
  });

  if (count === 1) return { ok: true };

  const exists = await db.productSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true },
  });
  return { ok: false, reason: exists ? "already-reviewed" : "not-found" };
}
