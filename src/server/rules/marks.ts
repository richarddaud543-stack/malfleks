import { getPrisma } from "@/server/db/client";

/**
 * "This rule has already done its one thing for this subject."
 *
 * A rule that sends a reminder must send it once, however many times it runs
 * and however many copies of it run at the same moment. The schedule cannot
 * promise that -- a timer can call twice, a slow pass can overlap the next --
 * so the database does: a mark is a row whose primary key is the rule and the
 * subject, and only one insert of it can ever succeed.
 *
 * The rule claims the mark **before** it acts. The cost is that a reminder
 * lost to a failing email provider is not sent again; that is the right way
 * round for a message whose whole contract is "we only send this once", and it
 * is the same choice `remindBranchesOfWaitingOrders` made before this existed.
 */
export async function claimOnce(ruleKey: string, subjectId: string, at: Date = new Date()): Promise<boolean> {
  // `at` is the pass's own clock, not the wall clock: other rules measure
  // "how long since the warning" against the same clock, and the two must agree.
  const { count } = await getPrisma().ruleMark.createMany({
    data: [{ ruleKey, subjectId, createdAt: at }],
    skipDuplicates: true,
  });
  return count === 1;
}

/** When each of these subjects was marked by this rule. Subjects never marked are absent. */
export async function marksFor(ruleKey: string, subjectIds: string[]): Promise<Map<string, Date>> {
  if (subjectIds.length === 0) return new Map();
  const rows = await getPrisma().ruleMark.findMany({
    where: { ruleKey, subjectId: { in: subjectIds } },
    select: { subjectId: true, createdAt: true },
  });
  return new Map(rows.map((r) => [r.subjectId, r.createdAt]));
}
