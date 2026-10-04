import type { Metadata } from "next";
import Link from "next/link";

import {
  addLessonAction,
  answerQuestionAction,
  dismissQuestionAction,
  pauseAgentAction,
  retireLessonAction,
  runAgentNowAction,
  setAgentRankAction,
} from "@/app/actions/admin-city";
import ActionForm from "@/components/admin/ActionForm";
import { Badge, Card, Empty, inputClass, labelClass, Notice, PageHeader, plural, Section, Tile, Tiles } from "@/components/admin/ui";
import { CITY_KEY } from "@/agents/runtime";
import type { AgentRank } from "@/agents/types";
import { formatWhen } from "@/lib/charts";
import { requireAdmin } from "@/server/auth/dal";
import { readCity, type Resident } from "@/server/agents/city";

export const metadata: Metadata = {
  title: "The city",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The agents' city: who lives here, what they studied, what they did, and what
 * they are waiting to ask you.
 *
 * The page is the *view*; it does none of the work. Every agent runs in
 * `src/agents`, on MalFleks's own hosting, and would keep running with this
 * page deleted — which is the point of building it this way rather than on a
 * platform that can go quiet without saying so.
 */

const RANKS: { rank: AgentRank; label: string; meaning: string }[] = [
  { rank: "student", label: "Student", meaning: "Studies. Does no work." },
  { rank: "trainee", label: "Trainee", meaning: "Works, but only reports what it would do." },
  { rank: "employed", label: "Employed", meaning: "May prepare drafts for you to approve." },
];

const OUTCOME_LABEL: Record<string, string> = {
  ok: "all quiet",
  attention: "needs a look",
  error: "failed",
  skipped: "skipped",
};

const LEVEL_MARK: Record<string, string> = { problem: "text-[#b42318]", watch: "text-[#6b4a00]", info: "text-muted" };

function ResidentCard({ resident }: { resident: Resident }) {
  const next = RANKS.filter((entry) => entry.rank !== resident.rank);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-medium tracking-tight">{resident.name}</h3>
          <p className="mt-0.5 text-sm text-muted">{resident.job}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge status={resident.rank === "employed" ? "active" : resident.rank === "trainee" ? "pending" : "not live"} label={resident.rank} />
          {resident.paused && <Badge status="cancelled" label="paused" />}
          {!resident.needsModel && <Badge status="paid" label="costs nothing" />}
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className={labelClass}>Reads</dt>
          <dd className="mt-0.5 text-muted">{resident.reads.join(" · ")}</dd>
        </div>
        <div>
          <dt className={labelClass}>Changes</dt>
          <dd className="mt-0.5 text-muted">{resident.writes.length === 0 ? "Nothing — it only reports" : resident.writes.join(" · ")}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className={labelClass}>Brings to you instead of deciding</dt>
          <dd className="mt-0.5 text-muted">{resident.boundary}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className={labelClass}>Studied</dt>
          <dd className="mt-0.5 text-muted">
            {resident.studies.join(" · ")} · {plural(resident.lessonCount, "lesson")} from you
          </dd>
        </div>
      </dl>

      <p className="mt-3 border-t border-border pt-3 text-sm">
        {resident.lastShift ? (
          <>
            <span className="text-muted">Last shift {formatWhen(resident.lastShift.at)} — {OUTCOME_LABEL[resident.lastShift.outcome]}:</span>{" "}
            {resident.lastShift.summary}
          </>
        ) : (
          <span className="text-muted">Has not worked a shift yet.</span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionForm
          action={runAgentNowAction}
          hidden={{ agentKey: resident.key }}
          label="Run a shift now"
          pendingLabel="Working…"
          tone="primary"
          size="xs"
        />
        {next.map((entry) => (
          <ActionForm
            key={entry.rank}
            action={setAgentRankAction}
            hidden={{ agentKey: resident.key, rank: entry.rank }}
            label={entry.rank === "employed" ? "Employ" : entry.rank === "trainee" ? "Make a trainee" : "Back to school"}
            size="xs"
            confirm={<span className="text-xs text-muted">{entry.meaning}</span>}
            confirmLabel="Confirm"
          />
        ))}
        <ActionForm
          action={pauseAgentAction}
          hidden={{ agentKey: resident.key, paused: resident.paused ? "false" : "true" }}
          label={resident.paused ? "Let it work" : "Pause"}
          size="xs"
          tone={resident.paused ? "neutral" : "danger"}
        />
        <span className="text-xs text-muted">{plural(resident.shifts, "shift")} on record</span>
      </div>
    </Card>
  );
}

export default async function AdminCityPage() {
  await requireAdmin("/admin/city");
  const city = await readCity();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="The city"
        description="MalFleks's AI workers. Each one wakes, does one job, writes down what it found, and stops. They run on MalFleks's own hosting, not inside a chat."
        actions={
          <ActionForm
            action={pauseAgentAction}
            hidden={{ agentKey: CITY_KEY, paused: city.paused ? "false" : "true" }}
            label={city.paused ? "Start the city" : "Stop everything"}
            tone={city.paused ? "primary" : "danger"}
            confirm={
              city.paused ? undefined : <span className="text-xs text-muted">No agent will do anything until you start it again.</span>
            }
            confirmLabel="Stop them all"
          />
        }
      />

      {city.paused && <Notice tone="warn"><strong>The city is stopped.</strong> Every shift will record that it did nothing.</Notice>}

      <Tiles>
        <Tile label="Employed" value={city.totals.employed} note={`${city.totals.trainees} in training, ${city.totals.students} at school`} />
        <Tile label="Waiting on you" value={city.totals.openQuestions} note="Questions at the help desk" emphasis={city.totals.openQuestions > 0} />
        <Tile label="Lessons taught" value={city.totals.lessons} note={`${city.handbook.length} handbook sections`} />
        <Tile label="Shifts this week" value={city.totals.shifts7d} note="Every one recorded, including failures" />
      </Tiles>

      <Section id="help-desk" title="The help desk" note="An agent stops and asks rather than guessing. Your answer is kept as a lesson, so the same question is never asked twice.">
        {city.questions.length === 0 ? (
          <Empty>Nothing is waiting. An agent will ask here when it needs you.</Empty>
        ) : (
          <ul className="mt-3 space-y-3">
            {city.questions.map((question) => (
              <li key={question.id}>
                <Card className="p-4">
                  <p className="text-xs text-muted">
                    {question.agentName} · asked {formatWhen(question.createdAt)}
                  </p>
                  <p className="mt-1 font-medium">{question.question}</p>
                  {question.context && <p className="mt-1 text-sm text-muted">{question.context}</p>}
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <ActionForm
                      action={answerQuestionAction}
                      hidden={{ id: question.id }}
                      label="Answer and teach it"
                      pendingLabel="Saving…"
                      tone="primary"
                      size="xs"
                      confirm={
                        <label className="block">
                          <span className={labelClass}>Your answer</span>
                          <textarea name="answer" rows={3} required className={`${inputClass} mt-1 w-full sm:w-96`} />
                        </label>
                      }
                      confirmLabel="Save as a lesson"
                    />
                    <ActionForm action={dismissQuestionAction} hidden={{ id: question.id }} label="Not now" size="xs" />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {city.offices.map((office) => (
        <Section id={`office-${office.office.toLowerCase()}`} key={office.office} title={office.office} note={plural(office.residents.length, "agent")}>
          <ul className="mt-3 space-y-3">
            {office.residents.map((resident) => (
              <li key={resident.key}>
                <ResidentCard resident={resident} />
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <Section id="school" title="The school" note="The handbook is part of MalFleks itself and changes with the business. What you add here is taught on top of it.">
        <Card className="p-4">
          <h3 className="font-display text-base font-medium">The handbook</h3>
          <ul className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2">
            {city.handbook.map((section) => (
              <li key={section.key}>
                {section.title} <span className="text-xs">({plural(section.lines.length, "line")})</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="mt-3 p-4">
          <h3 className="font-display text-base font-medium">Teach something</h3>
          <div className="mt-2">
            <ActionForm
              action={addLessonAction}
              label="Add a lesson"
              pendingLabel="Saving…"
              tone="primary"
              confirm={
                <div className="grid gap-2 sm:max-w-lg">
                  <label className="block">
                    <span className={labelClass}>Who learns it</span>
                    <select name="agentKey" className={`${inputClass} mt-1 w-full`} defaultValue="">
                      <option value="">Every agent</option>
                      {city.offices.flatMap((office) => office.residents).map((resident) => (
                        <option key={resident.key} value={resident.key}>
                          {resident.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Name it</span>
                    <input name="title" required className={`${inputClass} mt-1 w-full`} placeholder="How we price delivery to Mbeya" />
                  </label>
                  <label className="block">
                    <span className={labelClass}>What to learn</span>
                    <textarea name="body" rows={3} required className={`${inputClass} mt-1 w-full`} />
                  </label>
                </div>
              }
              confirmLabel="Teach it"
            />
          </div>
        </Card>

        {city.lessons.length === 0 ? (
          <Empty>Nothing taught yet beyond the handbook.</Empty>
        ) : (
          <ul className="mt-3 space-y-2">
            {city.lessons.map((lesson) => (
              <li key={lesson.id}>
                <Card className={`p-4 ${lesson.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{lesson.title}</p>
                      <p className="mt-0.5 text-sm text-muted">{lesson.body}</p>
                      <p className="mt-1 text-xs text-muted">
                        {lesson.agentName ?? "Every agent"} · {lesson.source === "answer" ? "from your answer" : "written by you"} ·{" "}
                        {formatWhen(lesson.createdAt)}
                        {!lesson.active && " · retired"}
                      </p>
                    </div>
                    <ActionForm
                      action={retireLessonAction}
                      hidden={{ id: lesson.id, active: lesson.active ? "false" : "true" }}
                      label={lesson.active ? "Retire" : "Teach again"}
                      size="xs"
                      tone={lesson.active ? "danger" : "neutral"}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="archive" title="The archive" note="Every shift, including the ones that did nothing or failed. A gap here means the schedule is broken, not that all was well.">
        {city.recentShifts.length === 0 ? (
          <Empty>No shift has run yet. Press “Run a shift now” on an agent above.</Empty>
        ) : (
          <ul className="mt-3 space-y-2">
            {city.recentShifts.map((shift) => (
              <li key={shift.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {shift.agentName} <span className="text-muted">· {formatWhen(shift.startedAt)} · {shift.trigger}</span>
                    </p>
                    <Badge
                      status={shift.outcome === "ok" ? "paid" : shift.outcome === "attention" ? "pending" : shift.outcome === "error" ? "cancelled" : "not live"}
                      label={OUTCOME_LABEL[shift.outcome]}
                    />
                  </div>
                  <p className="mt-1 text-sm">{shift.summary}</p>
                  {shift.findings.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {shift.findings.map((finding, index) => (
                        <li key={index} className={LEVEL_MARK[finding.level] ?? "text-muted"}>
                          {finding.href ? (
                            <Link href={finding.href} className="underline underline-offset-2">
                              {finding.text}
                            </Link>
                          ) : (
                            finding.text
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted">Took {(shift.ms / 1000).toFixed(1)}s</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
