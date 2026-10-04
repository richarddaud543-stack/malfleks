"use server";

import { revalidatePath } from "next/cache";

import { agentByKey } from "@/agents/registry";
import { CITY_KEY, runAgent, setPaused, setRank } from "@/agents/runtime";
import { isRank, RANK_ORDER, type AgentRank } from "@/agents/types";
import { adminSession } from "@/server/auth/admin-session";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";

/**
 * The owner's side of the city: promoting an agent, pausing one or all of
 * them, answering a question, and teaching a lesson.
 *
 * Every action re-checks `adminSession()` itself. A Server Action is a public
 * HTTP endpoint, and the page that drew the button is not its gate.
 *
 * Nothing here lets an agent do more than its code allows: rank decides
 * whether it works and whether its output is a report or a draft, and both
 * meanings live in the agent, not in a column.
 */

export type CityState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

const FORBIDDEN: CityState = { status: "error", message: "Your session no longer has admin access. Sign in again." };
const FAILED: CityState = { status: "error", message: "That didn't go through, and nothing changed. It has been logged — try again." };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function refresh() {
  revalidatePath("/admin/city");
  revalidatePath("/admin");
}

const RANK_WORD: Record<AgentRank, string> = {
  student: "a student — it studies but does no work",
  trainee: "a trainee — it works and reports what it would do",
  employed: "employed — it may prepare drafts for you to approve",
};

export async function setAgentRankAction(_prev: CityState, formData: FormData): Promise<CityState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const key = field(formData, "agentKey");
  const rank = field(formData, "rank");
  const agent = agentByKey(key);
  if (!agent) return { status: "error", message: "No agent by that name lives here." };
  if (!isRank(rank)) return { status: "error", message: "That is not one of the three ranks." };

  try {
    await setRank(key, rank);
    refresh();
    const direction = RANK_ORDER[rank] > RANK_ORDER[agent.defaultRank] ? "promoted" : "moved";
    return { status: "ok", message: `${agent.name} is ${direction}: now ${RANK_WORD[rank]}.` };
  } catch (error) {
    await logServerError("city-set-rank", error, session.uid);
    return FAILED;
  }
}

export async function pauseAgentAction(_prev: CityState, formData: FormData): Promise<CityState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const key = field(formData, "agentKey");
  const paused = field(formData, "paused") === "true";
  // `*` is the whole-city switch and is deliberately not in the registry.
  if (key !== CITY_KEY && !agentByKey(key)) return { status: "error", message: "No agent by that name lives here." };

  try {
    await setPaused(key, paused);
    refresh();
    const who = key === CITY_KEY ? "The whole city" : (agentByKey(key)?.name ?? key);
    return { status: "ok", message: paused ? `${who} is paused. No shift will do anything until you start it again.` : `${who} is working again.` };
  } catch (error) {
    await logServerError("city-pause", error, session.uid);
    return FAILED;
  }
}

/** Run a shift now, from the city page. Same harness as the schedule; the archive records `manual`. */
export async function runAgentNowAction(_prev: CityState, formData: FormData): Promise<CityState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const key = field(formData, "agentKey");

  try {
    const outcome = await runAgent(key, "manual");
    refresh();
    if (!outcome.ok) return { status: "error", message: "No agent by that name lives here." };
    const { run } = outcome;
    return run.outcome === "error"
      ? { status: "error", message: run.summary }
      : { status: "ok", message: run.summary };
  } catch (error) {
    await logServerError("city-run-now", error, session.uid);
    return FAILED;
  }
}

/**
 * Answer a question, which makes it a lesson.
 *
 * The answer and the lesson are written together: a question marked answered
 * with no lesson stored would mean the agent asks nothing and learns nothing,
 * which is worse than never having answered. `helpRequestId` is unique on the
 * lesson, so a double submit cannot teach the same thing twice.
 */
export async function answerQuestionAction(_prev: CityState, formData: FormData): Promise<CityState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const id = field(formData, "id");
  const answer = field(formData, "answer");
  if (answer.length < 2) return { status: "error", message: "Write the answer first." };

  try {
    const db = getPrisma();
    const request = await db.agentHelpRequest.findUnique({ where: { id } });
    if (!request) return { status: "error", message: "That question is no longer here." };
    if (request.status !== "open") return { status: "ok", message: "That one was already dealt with." };

    await db.$transaction([
      db.agentHelpRequest.update({ where: { id }, data: { status: "answered", answer: answer.slice(0, 4000), answeredAt: new Date() } }),
      db.agentLesson.create({
        data: {
          agentKey: request.agentKey,
          title: request.question.slice(0, 200),
          body: answer.slice(0, 4000),
          source: "answer",
          helpRequestId: id,
        },
      }),
    ]);
    refresh();
    return { status: "ok", message: "Answered, and kept as a lesson. It will not be asked again." };
  } catch (error) {
    await logServerError("city-answer", error, session.uid);
    return FAILED;
  }
}

/** Dismiss a question without teaching anything. It stays dismissed, so it is not asked again. */
export async function dismissQuestionAction(_prev: CityState, formData: FormData): Promise<CityState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const id = field(formData, "id");
  try {
    const { count } = await getPrisma().agentHelpRequest.updateMany({ where: { id, status: "open" }, data: { status: "dismissed" } });
    refresh();
    return count > 0 ? { status: "ok", message: "Dismissed. It will not be asked again." } : { status: "ok", message: "That one was already dealt with." };
  } catch (error) {
    await logServerError("city-dismiss", error, session.uid);
    return FAILED;
  }
}

export async function addLessonAction(_prev: CityState, formData: FormData): Promise<CityState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const key = field(formData, "agentKey");
  const title = field(formData, "title");
  const body = field(formData, "body");
  if (title.length < 2 || body.length < 2) return { status: "error", message: "A lesson needs a name and something to learn." };
  if (key && !agentByKey(key)) return { status: "error", message: "No agent by that name lives here." };

  try {
    await getPrisma().agentLesson.create({
      data: { agentKey: key || null, title: title.slice(0, 200), body: body.slice(0, 4000), source: "owner" },
    });
    refresh();
    return { status: "ok", message: key ? `Taught to ${agentByKey(key)?.name}.` : "Taught to every agent." };
  } catch (error) {
    await logServerError("city-add-lesson", error, session.uid);
    return FAILED;
  }
}

/** Retire a lesson. Kept, not deleted: the archive may refer to what an agent once believed. */
export async function retireLessonAction(_prev: CityState, formData: FormData): Promise<CityState> {
  const session = await adminSession();
  if (!session) return FORBIDDEN;
  const id = field(formData, "id");
  const active = field(formData, "active") === "true";
  try {
    const { count } = await getPrisma().agentLesson.updateMany({ where: { id }, data: { active } });
    refresh();
    if (count === 0) return { status: "error", message: "That lesson is no longer here." };
    return { status: "ok", message: active ? "Taught again." : "Retired. It is kept on record but no longer taught." };
  } catch (error) {
    await logServerError("city-retire-lesson", error, session.uid);
    return FAILED;
  }
}
