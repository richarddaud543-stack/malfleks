import { HANDBOOK } from "@/agents/handbook";
import { AGENTS, offices } from "@/agents/registry";
import { CITY_KEY, readFindings, readMetrics } from "@/agents/runtime";
import { isRank, type AgentOutcome, type AgentRank, type Finding } from "@/agents/types";
import { getPrisma } from "@/server/db/client";

/**
 * Everything the city page shows, in one read.
 *
 * The roster comes from code and the standing from the database, joined here
 * rather than in the page: an agent with no row has never been touched by the
 * owner and shows its starting rank, which is a fact about the roster, not a
 * missing record.
 */

export interface Resident {
  key: string;
  name: string;
  office: string;
  job: string;
  reads: string[];
  writes: string[];
  boundary: string;
  needsModel: boolean;
  rank: AgentRank;
  paused: boolean;
  /** Handbook section titles this agent studies. */
  studies: string[];
  lessonCount: number;
  lastShift: { at: Date; outcome: AgentOutcome; summary: string } | null;
  shifts: number;
  openQuestions: number;
}

export interface ShiftRow {
  id: string;
  agentKey: string;
  agentName: string;
  trigger: string;
  outcome: AgentOutcome;
  summary: string;
  findings: Finding[];
  startedAt: Date;
  ms: number;
}

export interface Question {
  id: string;
  agentKey: string;
  agentName: string;
  topic: string;
  question: string;
  context: string | null;
  createdAt: Date;
}

export interface LessonRow {
  id: string;
  agentKey: string | null;
  agentName: string | null;
  title: string;
  body: string;
  source: string;
  active: boolean;
  createdAt: Date;
}

export interface City {
  now: Date;
  paused: boolean;
  offices: { office: string; residents: Resident[] }[];
  questions: Question[];
  lessons: LessonRow[];
  recentShifts: ShiftRow[];
  handbook: { key: string; title: string; lines: string[] }[];
  totals: { employed: number; trainees: number; students: number; openQuestions: number; lessons: number; shifts7d: number };
}

const OUTCOMES: AgentOutcome[] = ["ok", "attention", "error", "skipped"];
const asOutcome = (value: string): AgentOutcome => (OUTCOMES.includes(value as AgentOutcome) ? (value as AgentOutcome) : "error");

const nameOf = (key: string) => AGENTS.find((agent) => agent.key === key)?.name ?? key;

export async function readCity(now: Date = new Date()): Promise<City> {
  const db = getPrisma();
  const keys = AGENTS.map((agent) => agent.key);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60_000);

  const [states, lastRuns, runCounts, questionRows, lessonRows, recentRows, shifts7d] = await Promise.all([
    db.agentState.findMany({ where: { agentKey: { in: [...keys, CITY_KEY] } } }),
    // One row per agent: the newest shift of any kind, including a skip, so
    // "nothing has run" and "it ran and was paused" do not look alike.
    Promise.all(
      keys.map((key) =>
        db.agentRun.findFirst({
          where: { agentKey: key },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true, outcome: true, summary: true },
        }),
      ),
    ),
    db.agentRun.groupBy({ by: ["agentKey"], _count: { _all: true } }),
    db.agentHelpRequest.findMany({ where: { status: "open" }, orderBy: { createdAt: "asc" } }),
    db.agentLesson.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }], take: 50 }),
    db.agentRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    db.agentRun.count({ where: { startedAt: { gte: since7d } } }),
  ]);

  const stateOf = (key: string) => states.find((state) => state.agentKey === key);
  const lessonsPerAgent = (key: string) =>
    lessonRows.filter((lesson) => lesson.active && (lesson.agentKey === key || lesson.agentKey === null)).length;

  const residents = new Map<string, Resident>();
  AGENTS.forEach((agent, index) => {
    const state = stateOf(agent.key);
    const last = lastRuns[index];
    const rank = state && isRank(state.rank) ? state.rank : agent.defaultRank;
    residents.set(agent.key, {
      key: agent.key,
      name: agent.name,
      office: agent.office,
      job: agent.job,
      reads: agent.reads,
      writes: agent.writes,
      boundary: agent.boundary,
      needsModel: agent.needsModel,
      rank,
      paused: state?.paused ?? false,
      studies: HANDBOOK.filter((section) => agent.curriculum.includes(section.key)).map((section) => section.title),
      lessonCount: lessonsPerAgent(agent.key),
      lastShift: last ? { at: last.startedAt, outcome: asOutcome(last.outcome), summary: last.summary } : null,
      shifts: runCounts.find((row) => row.agentKey === agent.key)?._count._all ?? 0,
      openQuestions: questionRows.filter((row) => row.agentKey === agent.key).length,
    });
  });

  const ranks = [...residents.values()].map((resident) => resident.rank);

  return {
    now,
    paused: stateOf(CITY_KEY)?.paused ?? false,
    offices: offices().map((entry) => ({
      office: entry.office,
      residents: entry.agents.map((agent) => residents.get(agent.key)).filter((r): r is Resident => Boolean(r)),
    })),
    questions: questionRows.map((row) => ({
      id: row.id,
      agentKey: row.agentKey,
      agentName: nameOf(row.agentKey),
      topic: row.topic,
      question: row.question,
      context: row.context,
      createdAt: row.createdAt,
    })),
    lessons: lessonRows.map((row) => ({
      id: row.id,
      agentKey: row.agentKey,
      agentName: row.agentKey ? nameOf(row.agentKey) : null,
      title: row.title,
      body: row.body,
      source: row.source,
      active: row.active,
      createdAt: row.createdAt,
    })),
    recentShifts: recentRows.map((row) => ({
      id: row.id,
      agentKey: row.agentKey,
      agentName: nameOf(row.agentKey),
      trigger: row.trigger,
      outcome: asOutcome(row.outcome),
      summary: row.summary,
      findings: readFindings(row.findings),
      startedAt: row.startedAt,
      ms: Math.max(0, row.finishedAt.getTime() - row.startedAt.getTime()),
    })),
    handbook: HANDBOOK.map((section) => ({ key: section.key, title: section.title, lines: section.lines })),
    totals: {
      employed: ranks.filter((rank) => rank === "employed").length,
      trainees: ranks.filter((rank) => rank === "trainee").length,
      students: ranks.filter((rank) => rank === "student").length,
      openQuestions: questionRows.length,
      lessons: lessonRows.filter((lesson) => lesson.active).length,
      shifts7d,
    },
  };
}

/** The last shift's numbers for one agent, for the archive view. Unused keys are dropped by `readMetrics`. */
export async function lastMetrics(agentKey: string) {
  const row = await getPrisma().agentRun.findFirst({
    where: { agentKey, outcome: { in: ["ok", "attention"] } },
    orderBy: { startedAt: "desc" },
    select: { metrics: true, startedAt: true },
  });
  return row ? { at: row.startedAt, metrics: readMetrics(row.metrics) } : null;
}
