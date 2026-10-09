-- Shop registration documents, the AI screening verdict, and who pays for
-- delivery. 6 Oct 2026.
--
-- Additive only. Every column added here is nullable or defaulted, every table
-- is new, and nothing existing is dropped or narrowed -- so this applies to the
-- live database while the old code is still serving, exactly like
-- 20261005120000_delivery_code_auto_payouts before it.
--
-- Read `src/lib/fees/tables.ts` (DELIVERY_MODES) and
-- `src/lib/partner-document.ts` (DOCUMENT_KINDS) for what the text columns mean.
--
-- Two things a reviewer will reach for and should not:
--
--   * The indexes are NOT `CREATE INDEX CONCURRENTLY`. They cannot be: Prisma
--     runs each migration inside a transaction and CONCURRENTLY is forbidden
--     there. It also buys nothing -- these three index a table created four
--     lines above, which has no rows and no readers.
--   * `ADD COLUMN ... NOT NULL DEFAULT` on the existing `Partner` table does
--     not rewrite it. Since Postgres 11 a constant default is stored in the
--     catalogue, so this is a brief metadata-only lock on a table of a handful
--     of rows.

-- ---------------------------------------------------------------------------
-- Who pays for delivery
-- ---------------------------------------------------------------------------

-- Null on a courier application and on anything filed before today.
ALTER TABLE "PartnerApplication" ADD COLUMN "deliveryMode" TEXT;

-- Defaulted, not nullable: every order asks this question, and a partner
-- approved before today reads as "customer_pays", which is how its orders were
-- already priced.
ALTER TABLE "Partner" ADD COLUMN "deliveryMode" TEXT NOT NULL DEFAULT 'customer_pays';

-- Frozen on the order at order time, so a shop that changes its answer
-- tomorrow cannot re-price an order that is already paid for. Null together
-- with the other quote columns on an order that never got a quote.
ALTER TABLE "Order" ADD COLUMN "quoteCustomerDeliveryTZS" INTEGER;
ALTER TABLE "Order" ADD COLUMN "quoteShopDeliveryShareTZS" INTEGER;
ALTER TABLE "Order" ADD COLUMN "quoteDeliveryMode" TEXT;

-- ---------------------------------------------------------------------------
-- The AI screening verdict on an application
-- ---------------------------------------------------------------------------

-- Advisory only. Nothing in the codebase approves a partner from these; the
-- admin still presses approve. See src/server/ai/document-check.ts.
ALTER TABLE "PartnerApplication" ADD COLUMN "aiVerdict" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN "aiNotes" TEXT;
ALTER TABLE "PartnerApplication" ADD COLUMN "aiCheckedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- The documents themselves
-- ---------------------------------------------------------------------------

CREATE TABLE "PartnerDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiVerdict" TEXT,
    "aiNotes" TEXT,
    "aiCheckedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerDocument_pkey" PRIMARY KEY ("id")
);

-- One row per uploaded object. Re-uploading the same document is a new path
-- (the stamp in `partnerDocumentPath`), so this catches a double-submit of one
-- upload rather than a genuine second attempt.
CREATE UNIQUE INDEX "PartnerDocument_storagePath_key" ON "PartnerDocument"("storagePath");

CREATE INDEX "PartnerDocument_applicationId_idx" ON "PartnerDocument"("applicationId");
CREATE INDEX "PartnerDocument_uid_idx" ON "PartnerDocument"("uid");

-- Deleting an application takes its documents with it. The Storage objects are
-- a separate lifecycle -- see the note in src/server/partners/documents.ts.
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as every other table in this schema: the app reaches Postgres as the
-- owner over a pooled connection and never through Supabase's anon key, so RLS
-- adds nothing for us -- but a table in `public` with RLS off is a standing
-- Supabase advisor warning, and this table holds licence metadata.
ALTER TABLE "PartnerDocument" ENABLE ROW LEVEL SECURITY;
