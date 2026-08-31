-- Let a delivery agent have no published phone number.
--
-- Every seeded courier number was invented: +255 68 000 0001 through 0005, a
-- counting sequence, and two of them sat on records flagged `verified: true`.
-- `AgentCard` rendered them as `tel:` links, so the live site was inviting
-- customers to dial numbers nobody answers.
--
-- `Branch.phone` has always been nullable for exactly this reason, and
-- `OrderConfirmation` already had the copy for a branch without one. This
-- brings couriers into line rather than inventing replacements.
ALTER TABLE "DeliveryAgent" ALTER COLUMN "phone" DROP NOT NULL;

-- Clear the fabricated values already in production.
UPDATE "DeliveryAgent" SET "phone" = NULL WHERE "phone" LIKE '+255 68 000 000%';

-- Same for the four invented branch numbers.
UPDATE "Branch" SET "phone" = NULL
WHERE "phone" LIKE '+255 22 286 %000' OR "phone" = '+255 76 000 0000';
