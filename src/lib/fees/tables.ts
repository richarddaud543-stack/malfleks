/**
 * Soko's fee tables — data, not code.
 *
 * Everything in this file is a number the owner decides, transcribed verbatim
 * from `docs/marketplace-model.md` §2. It is deliberately separated from the
 * arithmetic in `./index.ts` so that changing a fee is editing a table, not
 * editing a function: these numbers have already changed twice in one
 * conversation, and the model document says in as many words that both ladders
 * must be data a non-engineer can change without a deploy.
 *
 * The rule for anyone editing this file: change a number, run the tests. The
 * reconciliation properties in `fees.test.ts` do not care what the numbers are,
 * only that they stay coherent — so a mistake here surfaces as a failing test
 * rather than as a wrong amount of money.
 *
 * Nothing here is inferred, rounded or re-derived. Where the model document
 * leaves a question open, the value carries an OWNER_DEFAULT comment naming the
 * open question and the section it is argued in, so the default is visibly a
 * default rather than a decision someone made quietly.
 */

/** Whole Tanzanian shillings. Never a float — see `docs/backend.md`. */
export type TZS = number;

/**
 * One rung of a fee ladder. `minTZS` and `maxTZS` are both inclusive, and
 * `maxTZS: null` marks the open-ended top rung.
 */
export interface FeeBand {
  minTZS: TZS;
  maxTZS: TZS | null;
  feeTZS: TZS;
}

/**
 * The platform fee on the **goods payment only**, charged to the customer as
 * the deposit at order time. `docs/marketplace-model.md` §2, "The platform fee
 * is a ladder on the goods, not a percentage".
 *
 * The first two rungs are the founder's own. The rest deliberately flatten to
 * a 40,000 ceiling — the model document is explicit that this converts Soko
 * from a commission business into a transaction-fee business, and that the
 * flattening is the entire point rather than a rounding artefact. Read the
 * "What the 40,000 cap means for the business" block before changing the cap.
 */
export const GOODS_FEE_LADDER: readonly FeeBand[] = [
  { minTZS: 1_000, maxTZS: 5_000, feeTZS: 500 },
  { minTZS: 5_001, maxTZS: 10_000, feeTZS: 1_000 },
  { minTZS: 10_001, maxTZS: 25_000, feeTZS: 2_000 },
  { minTZS: 25_001, maxTZS: 50_000, feeTZS: 3_500 },
  { minTZS: 50_001, maxTZS: 100_000, feeTZS: 6_000 },
  { minTZS: 100_001, maxTZS: 250_000, feeTZS: 9_000 },
  { minTZS: 250_001, maxTZS: 500_000, feeTZS: 14_000 },
  { minTZS: 500_001, maxTZS: 1_000_000, feeTZS: 19_000 },
  { minTZS: 1_000_001, maxTZS: 5_000_000, feeTZS: 26_000 },
  { minTZS: 5_000_001, maxTZS: 20_000_000, feeTZS: 32_000 },
  { minTZS: 20_000_001, maxTZS: 100_000_000, feeTZS: 36_000 },
  { minTZS: 100_000_001, maxTZS: null, feeTZS: 40_000 },
] as const;

/**
 * What Soko takes from the **courier**, per delivery, banded by what the
 * delivery itself costs. `docs/marketplace-model.md` §2, "Delivery is priced by
 * Soko per city, and billed to the courier".
 *
 * The bottom rung is settled as 5,000 per 10 deliveries. That is a settlement
 * cadence, not a different rate — the accrual is 500 per delivery and this
 * module accrues, exactly as the model document assumes.
 *
 * This ladder supersedes the flat 1,000 TZS off-platform fee entirely. It is
 * not reinstated as a penalty; whether it was ever meant as one is open
 * question 7 in §5 and is the owner's to answer.
 */
export const DELIVERY_FEE_LADDER: readonly FeeBand[] = [
  { minTZS: 0, maxTZS: 3_000, feeTZS: 500 },
  { minTZS: 3_001, maxTZS: 25_000, feeTZS: 1_500 },
  { minTZS: 25_001, maxTZS: null, feeTZS: 2_500 },
] as const;

/**
 * The four cities Soko operates in, matching `city` in `src/data/branches.ts`
 * exactly. A fifth city is a data change here plus real branches there — not a
 * code change.
 */
export const DELIVERY_CITIES = [
  "Dar es Salaam",
  "Arusha",
  "Mwanza",
  "Dodoma",
] as const;

export type DeliveryCity = (typeof DELIVERY_CITIES)[number];

/**
 * What Soko charges the customer for delivery, per city. Soko sets these — not
 * the courier, not the branch — and they are quotable upfront.
 *
 * **All four are deliberately unset.** The model document decides that these
 * exist and who owns them; it does not say what they are, and no engineer may
 * invent one. `null` means "not yet decided by the owner", and
 * `quoteOrder()` refuses to quote against it rather than returning zero — a
 * zero here would render to a customer as free delivery and to a courier as
 * "you owe nothing", both of which are false statements about money.
 *
 * Mercury is researching what couriers actually charge in each city
 * (MERCURY-06) and will hand the owner a directional recommendation. Filling
 * these in is a one-line edit each, and the tests will tell you immediately if
 * a number is incoherent.
 */
export const CITY_DELIVERY_FEES: Readonly<Record<DeliveryCity, TZS | null>> = {
  "Dar es Salaam": null,
  Arusha: null,
  Mwanza: null,
  Dodoma: null,
};

/**
 * Does a brand-fleet order carry a delivery rung?
 *
 * OWNER_DEFAULT — open question 5 in `docs/marketplace-model.md` §5: "Does the
 * deposit apply to brand-fleet orders?" On a brand route there is no courier,
 * so no delivery money passes through Soko and there is nothing to bill. The
 * deposit is therefore the goods rung alone and Soko earns nothing from the
 * delivery leg. That is what §2 describes; it affects 6 of 19 branches and the
 * owner has not confirmed it.
 */
export const BRAND_FLEET_EARNS_DELIVERY_RUNG = false;

/**
 * A minimum order value, below which Soko will not take an order at all.
 *
 * OWNER_DEFAULT — open question 4 in §5, "The bottom rung". The cheapest
 * product in the catalogue is TZS 2,000 and a 500 TZS fee on it is 25%. The
 * document offers three ways out: accept it, add a narrower first rung, or set
 * a minimum order value. `null` is "accept it", which is today's behaviour and
 * the only one of the three that invents no number.
 */
export const MINIMUM_ORDER_VALUE_TZS: TZS | null = null;

/**
 * A weight or size surcharge on delivery.
 *
 * OWNER_DEFAULT — open question 6 in §5. Today an SUV and a pair of earbuds
 * are quoted the same delivery fee, because `Product` cannot carry a weight.
 * Nothing to configure until it can.
 */
export const WEIGHT_SURCHARGE_ENABLED = false;

/**
 * Fails loudly if the tables above are not internally coherent.
 *
 * The tables are meant to be edited by someone who is not an engineer — that is
 * the whole point of them being data — so this guard rail is the feature, not
 * ceremony. It is called by the tests and is cheap enough to call at startup.
 *
 * It deliberately does **not** check that a city fee is set: an unset city is a
 * legitimate state of this file today, and it is `quoteOrder()` that refuses to
 * quote against one.
 *
 * @throws {Error} naming the first incoherence found.
 */
export function assertTablesCoherent(): void {
  const checkLadder = (name: string, ladder: readonly FeeBand[]) => {
    if (ladder.length === 0) throw new Error(`${name}: ladder is empty`);

    ladder.forEach((band, i) => {
      if (!Number.isInteger(band.feeTZS) || band.feeTZS < 0) {
        throw new Error(
          `${name}: band ${i} has a non-integer or negative fee (${band.feeTZS})`,
        );
      }
      if (!Number.isInteger(band.minTZS) || band.minTZS < 0) {
        throw new Error(
          `${name}: band ${i} has a non-integer or negative minTZS (${band.minTZS})`,
        );
      }
      if (band.maxTZS !== null) {
        if (!Number.isInteger(band.maxTZS)) {
          throw new Error(`${name}: band ${i} has a non-integer maxTZS`);
        }
        if (band.maxTZS < band.minTZS) {
          throw new Error(
            `${name}: band ${i} is inverted (${band.minTZS} > ${band.maxTZS})`,
          );
        }
      }
    });

    // Only the last band may be open-ended.
    ladder.forEach((band, i) => {
      if (band.maxTZS === null && i !== ladder.length - 1) {
        throw new Error(
          `${name}: band ${i} is open-ended but is not the last band`,
        );
      }
    });
    if (ladder[ladder.length - 1].maxTZS !== null) {
      throw new Error(`${name}: the top band must be open-ended (maxTZS: null)`);
    }

    // Contiguous and ascending: no gap a value could fall into, no overlap
    // where two bands both claim it.
    for (let i = 1; i < ladder.length; i += 1) {
      const previous = ladder[i - 1];
      const current = ladder[i];
      if (previous.maxTZS === null) continue;
      if (current.minTZS !== previous.maxTZS + 1) {
        throw new Error(
          `${name}: bands ${i - 1} and ${i} are not contiguous — ` +
            `${previous.maxTZS} is followed by ${current.minTZS}`,
        );
      }
    }
  };

  checkLadder("GOODS_FEE_LADDER", GOODS_FEE_LADDER);
  checkLadder("DELIVERY_FEE_LADDER", DELIVERY_FEE_LADDER);

  for (const city of DELIVERY_CITIES) {
    const fee = CITY_DELIVERY_FEES[city];
    if (fee !== null && (!Number.isInteger(fee) || fee < 0)) {
      throw new Error(
        `CITY_DELIVERY_FEES: ${city} is not a non-negative whole number (${fee})`,
      );
    }
  }

  if (
    MINIMUM_ORDER_VALUE_TZS !== null &&
    (!Number.isInteger(MINIMUM_ORDER_VALUE_TZS) || MINIMUM_ORDER_VALUE_TZS < 0)
  ) {
    throw new Error(
      "MINIMUM_ORDER_VALUE_TZS must be null or a non-negative whole number",
    );
  }
}
