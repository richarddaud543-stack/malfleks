-- The one reminder a branch is sent for an order it has not answered in 24h.
-- Nullable with no default: every existing order reads as "never reminded".
-- Additive only; nothing is rewritten.
ALTER TABLE "Order" ADD COLUMN "branchRemindedAt" TIMESTAMP(3);
