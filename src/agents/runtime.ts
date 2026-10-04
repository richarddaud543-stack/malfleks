import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import { handbookText } from "./handbook";
import { agentByKey } from "./registry";
import {
  isRank,
  mayWork,
  type Agent,
  type AgentMetrics,
  type AgentOutcome,
  type AgentRank,
  type AgentTrigger,
  type Finding,
  type FindingLevel,
  type Lesson,
} from "./types";

/**
 * The harness every shift runs inside: standing, memory, the help desk, and
 * the archive.
 *
 * ## The one rule that makes the archive worth having
 *
 * A row is written for every shift -- including one that crashed, and one that
 * was skipped because the agent is paused or still at school. A silent gap is
 * indistinguishable from "nothing was wrong", and that is precisely the claim
 * a watch must never make by accident. So the `finally` here is not tidiness:
 * it is the contract.
 *
 * ## Nothing here reaches the owner
 *
 * No email, no push, no message. A shift writes to MalFleks's own database and
 * the city page reads it. Adding a notification is a decision about the
 * owner's attention and belongs to him, not to a harness.
 */

/** The agent key that stands for the whole city, used by the one switch that stops everybody. */
export const CITY_KEY = "*";

export interface ShiftRecord {
  id: string;
  agentKey: string;
  trigger: AgentTrigger;
  outcome: AgentOutcome;
  summary: string;
  findings: Finding[];
  metrics: AgentMetrics;
  startedAt: Date;
  finishedAt: Date;
}

type Db = ReturnType<typeof getPrisma>;

/** A shift that could not even start. `unknown-agent` is the only one a caller can cause. */
export type RunRefusal = { ok: false; reason: "unknown-agent" };
export type RunOutcome = { ok: true; run: ShiftRecord } | RunRefusal;

export async function agentRank(key: string, db: Db = getPrisma()): Promise<AgentRank> {
  const agent = agentByKey(key);
  const state = await db.agentState.findUnique({ where: { agentKey: key }, select: { rank: true } });
  // A rank the owner set wins; no row, a row created by pausing, or a value
  // from an older deploy all fall back to what the roster says.
  if (state?.rank && isRank(state.rank)) return state.rank;
  return agent?.defaultRank ?? "student";
}

/** Paused for this agent, or for the whole city. Either stops the shift. */
export async function isPaused(key: string, db: Db = getPrisma()): Promise<boolean> {
  const rows = await db.agentState.findMany({ where: { agentKey: { in: [key, CITY_KEY] } }, select: { paused: true } });
  return rows.some((row) => row.paused);
}

export async function setRank(key: string, rank: AgentRank, db: Db = getPrisma()): Promise<void> {
  await db.agentState.upsert({ where: { agentKey: key }, create: { agentKey: key, rank }, update: { rank } });
}

export async function setPaused(key: string, paused: boolean, db: Db = getPrisma()): Promise<void> {
  await db.agentState.upsert({ where: { agentKey: key }, create: { agentKey: key, paused }, update: { paused } });
}

/** This agent's lessons and the ones taught to everybody, newest first. */
export async function lessonsFor(key: string, db: Db = getPrisma()): Promise<Lesson[]> {
  const rows = await db.agentLesson.findMany({
    where: { active: true, OR: [{ agentKey: key }, { agentKey: null }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, agentKey: true },
  });
  return rows.map((row) => ({ id: row.id, title: row.title, body: row.body, everyone: row.agentKey === null }));
}

/**
 * The previous shift's memory.
 *
 * Only a shift that actually worked counts: a skipped or crashed one wrote no
 * numbers, and treating its empty metrics as "what the world looked like last
 * time" would make the next shift report everything as new.
 */
async function previousShift(key: string, db: Db): Promise<{ metrics: AgentMetrics; at: Date } | null> {
  const row = await db.agentRun.findFirst({
    where: { agentKey: key, outcome: { in: ["ok", "attention"] } },
    orderBy: { startedAt: "desc" },
    select: { metrics: true, startedAt: true },
  });
  if (!row) return null;
  return { metrics: readMetrics(row.metrics), at: row.startedAt };
}

/** Json from the database, narrowed back to the flat shape agents write. Anything else is dropped rather than trusted. */
export function readMetrics(value: unknown): AgentMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metrics: AgentMetrics = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry === "number" || typeof entry === "boolean" || typeof entry === "string") {
      metrics[key] = entry;
    }
  }
  return metrics;
}

const LEVELS: FindingLevel[] = ["info", "watch", "problem"];

export function readFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];
  const findings: Finding[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.text !== "string") continue;
    const level = LEVELS.includes(row.level as FindingLevel) ? (row.level as FindingLevel) : "info";
    findings.push({ level, text: row.text, ...(typeof row.href === "string" ? { href: row.href } : {}) });
  }
  return findings;
}

/**
 * File a question for the owner, once ever.
 *
 * The uniqueness is the database's, not a prior read: two shifts asking the
 * same thing at the same moment would both pass a check-then-insert. The
 * second one's insert is refused and reads as "already asked", which is the
 * right answer.
 */
export async function askOwner(
  agentKey: string,
  topic: string,
  question: string,
  context: string | undefined,
  db: Db = getPrisma(),
): Promise<boolean> {
  const { count } = await db.agentHelpRequest.createMany({
    data: [{ agentKey, topic, question, context: context ?? null }],
    skipDuplicates: true,
  });
  return count > 0;
}

/** Cap what one shift can write, so a loop in an agent cannot bloat the archive. */
const MAX_FINDINGS = 60;
const MAX_SUMMARY = 300;

/**
 * Run one shift and record it.
 *
 * Never throws: an agent that crashes is a recorded `error`, because the
 * caller is a cron route whose own failure would hide the agent's.
 */
export async function runAgent(key: string, trigger: AgentTrigger, now: Date = new Date()): Promise<RunOutcome> {
  const agent = agentByKey(key);
  if (!agent) return { ok: false, reason: "unknown-agent" };

  const db = getPrisma();
  const startedAt = now;
  const findings: Finding[] = [];
  let outcome: AgentOutcome = "error";
  let summary = "The shift ended without saying anything.";
  let metrics: AgentMetrics = {};

  try {
    const [rank, paused] = await Promise.all([agentRank(agent.key, db), isPaused(agent.key, db)]);

    if (paused) {
      outcome = "skipped";
      summary = "Paused, so this shift did nothing.";
    } else if (!mayWork(rank)) {
      outcome = "skipped";
      summary = "Still at school: a student does no work until the owner graduates it.";
    } else {
      const [lessons, previous] = await Promise.all([lessonsFor(agent.key, db), previousShift(agent.key, db)]);
      const result = await agent.run({
        now,
        rank,
        trigger,
        handbook: handbookText(agent.curriculum),
        lessons,
        previous: previous?.metrics ?? null,
        previousAt: previous?.at ?? null,
        note: (level, text, href) => {
          if (findings.length < MAX_FINDINGS) findings.push({ level, text, ...(href ? { href } : {}) });
        },
        ask: (topic, question, context) => askOwner(agent.key, topic, question, context, db),
      });
      outcome = result.outcome;
      summary = result.summary.slice(0, MAX_SUMMARY);
      metrics = result.metrics;
    }
  } catch (error) {
    outcome = "error";
    summary = error instanceof Error ? `The shift failed: ${error.message}`.slice(0, MAX_SUMMARY) : "The shift failed.";
    await logServerError(`agent-${agent.key}`, error);
  }

  const finishedAt = new Date();
  const record: Omit<ShiftRecord, "id"> = {
    agentKey: agent.key,
    trigger,
    outcome,
    summary,
    findings,
    metrics,
    startedAt,
    finishedAt,
  };

  // The write is the point of the whole function; if even this fails there is
  // nowhere left to report it, so it is logged and the caller still gets the
  // outcome rather than an exception.
  let id = "";
  try {
    const row = await db.agentRun.create({
      data: {
        ...record,
        findings: findings as unknown as Prisma.InputJsonValue,
        metrics: metrics as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    id = row.id;
  } catch (error) {
    await logServerError(`agent-${agent.key}-archive`, error);
  }

  return { ok: true, run: { id, ...record } };
}

export type { Agent };
