-- Let a branch have no confirmed street address or opening hours.
--
-- Every address in the catalogue was a plausible street name that nobody had
-- checked, and every set of opening hours was invented. The one branch whose
-- address could finally be confirmed against a primary source — iStore
-- Tanzania, from their own contact page — turned out to contradict the
-- catalogue: it said Mlimani City, their site says Mikocheni.
--
-- Rather than publish guesses next to a "Verified" badge, the columns now
-- permit absence and the UI tells the visitor to confirm with the brand. This
-- is the same choice `Branch.phone` and `DeliveryAgent.phone` already made.
ALTER TABLE "Branch" ALTER COLUMN "addressLine" DROP NOT NULL;
ALTER TABLE "Branch" ALTER COLUMN "hours" DROP NOT NULL;
