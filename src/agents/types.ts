/**
 * What an agent is, in this codebase.
 *
 * An agent is a function with a job description. It is not a process, not a
 * subscription, and not a thing that thinks while idle: it wakes, works for a
 * few seconds, writes down what it found, and stops. An idle agent costs
 * nothing, which is why "wake, work, sleep" is the shape rather than a
 * compromise.
 *
 * The roster lives in `registry.ts` -- in code, because a job description
 * that can be edited from a web page is one nobody reviewed. What changes
 * while agents work (their rank, their shifts, their lessons, their
 * questions) is in the database.
 */

export type AgentRank = "student" | "trainee" | "employed";

/** Where a shift came from. `event` is work that arrived (a photo, an application), not a clock. */
export type AgentTrigger = "schedule" | "manual" | "event";

/**
 * `ok` -- nothing needs a person.
 * `attention` -- the agent found something a person should look at.
 * `error` -- the shift threw. Written by the runtime, never by an agent.
 * `skipped` -- the agent did not work: still at school, or paused.
 */
export type AgentOutcome = "ok" | "attention" | "error" | "skipped";

/** `watch` is "worth knowing"; `problem` is "someone has to act". */
export type FindingLevel = "info" | "watch" | "problem";

export interface Finding {
  level: FindingLevel;
  text: string;
  /** Where in the console to go and deal with it. */
  href?: string;
}

/** Flat on purpose: these are compared with the previous shift's, and a nested shape makes "what changed" unanswerable. */
export type AgentMetrics = Record<string, number | boolean | string | null>;

export interface Lesson {
  id: string;
  title: string;
  body: string;
  /** True when this lesson was taught to every agent rather than this one. */
  everyone: boolean;
}

/** Everything an agent is given when it wakes. */
export interface AgentShift {
  now: Date;
  rank: AgentRank;
  trigger: AgentTrigger;

  /** The handbook sections this agent studies, as text for a prompt. */
  handbook: string;
  /** What the owner has taught on top of the handbook, newest first. */
  lessons: Lesson[];

  /**
   * The metrics the previous shift wrote, or null on the very first one. This
   * is the agent's only memory: anything not written to `metrics` is gone.
   */
  previous: AgentMetrics | null;
  /** When that previous shift ran. */
  previousAt: Date | null;

  /** Record something found. Order is kept. */
  note(level: FindingLevel, text: string, href?: string): void;

  /**
   * Ask the owner, once ever.
   *
   * `topic` is the identity of the question, not its wording: a topic already
   * asked -- open, answered or dismissed -- is not asked again, so an agent
   * can call this on every shift without nagging. Returns true only when a
   * new question was filed.
   */
  ask(topic: string, question: string, context?: string): Promise<boolean>;
}

export interface AgentResult {
  outcome: "ok" | "attention";
  /** One sentence a person can read in a list. */
  summary: string;
  metrics: AgentMetrics;
}

export interface Agent {
  /** Stable, url-safe: it is the registry key, the API path and the archive's foreign key. */
  key: string;
  name: string;
  /** The department it sits in, for the city. */
  office: string;
  /** One sentence: what it does. */
  job: string;

  /** In plain words, for the city page -- what it may look at. */
  reads: string[];
  /** What it may change. An empty list means it only reports. */
  writes: string[];
  /** What it must bring to the owner instead of deciding alone. */
  boundary: string;

  /** Whether a shift costs money. False for arithmetic and HTTP checks. */
  needsModel: boolean;
  /** Handbook section keys this agent studies. */
  curriculum: string[];
  /** The rank it starts at, before the owner has promoted anyone. */
  defaultRank: AgentRank;

  run(shift: AgentShift): Promise<AgentResult>;
}

export const RANK_ORDER: Record<AgentRank, number> = { student: 0, trainee: 1, employed: 2 };

export function isRank(value: unknown): value is AgentRank {
  return value === "student" || value === "trainee" || value === "employed";
}

/** A student does not work at all. Everyone else does; what they may *write* is the agent's own business. */
export function mayWork(rank: AgentRank): boolean {
  return rank !== "student";
}
