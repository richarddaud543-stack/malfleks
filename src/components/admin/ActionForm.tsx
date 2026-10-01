"use client";

import { useActionState, useState, type ReactNode } from "react";

import type { ConsoleState } from "@/app/actions/admin-console";

type Tone = "primary" | "neutral" | "danger";

const BUTTON: Record<Tone, string> = {
  primary: "border-accent bg-accent text-white hover:bg-accent/90",
  neutral: "border-border bg-white text-foreground hover:border-accent",
  danger: "border-[#b42318] bg-white text-[#b42318] hover:bg-[#b42318] hover:text-white",
};

/**
 * One console action: a form posting to a Server Action, its pending state,
 * and what happened, shown right beside the button that did it.
 *
 * `confirm` makes it two-step: the first click only arms it and says what is
 * about to happen; nothing is sent until the second. Used for anything that
 * touches money or what customers see. Never `window.confirm()` — it is
 * unstyled, unannounced to screen readers, and blocks the tab.
 *
 * `children` are extra fields (amount, reference, reason...). When `confirm`
 * is set they appear only once armed, so the first click is cheap.
 */
export default function ActionForm({
  action,
  hidden = {},
  label,
  pendingLabel,
  confirm,
  confirmLabel,
  tone = "neutral",
  children,
  className = "",
  size = "sm",
  ariaLabel,
}: {
  action: (state: ConsoleState, formData: FormData) => Promise<ConsoleState>;
  hidden?: Record<string, string>;
  label: string;
  pendingLabel?: string;
  confirm?: ReactNode;
  confirmLabel?: string;
  tone?: Tone;
  children?: ReactNode;
  className?: string;
  size?: "xs" | "sm";
  ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<ConsoleState, FormData>(action, { status: "idle" });
  const [armed, setArmed] = useState(false);
  const pad = size === "xs" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  const button = `rounded-md border font-medium transition-colors disabled:opacity-60 ${pad}`;

  const showFields = !confirm || armed;

  return (
    <form
      action={(formData) => {
        setArmed(false);
        formAction(formData);
      }}
      className={className}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {showFields && children}

      <div className={`flex flex-wrap items-center gap-2 ${showFields && children ? "mt-3" : ""}`}>
        {confirm && !armed ? (
          <button type="button" onClick={() => setArmed(true)} className={`${button} ${BUTTON[tone]}`} aria-label={ariaLabel}>
            {label}
          </button>
        ) : (
          <>
            {confirm && <span className="mr-auto text-sm text-muted">{confirm}</span>}
            {confirm && (
              <button type="button" onClick={() => setArmed(false)} disabled={pending} className={`${button} ${BUTTON.neutral}`}>
                Back
              </button>
            )}
            <button type="submit" disabled={pending} className={`${button} ${BUTTON[tone]}`} aria-label={confirm ? undefined : ariaLabel}>
              {pending ? (pendingLabel ?? "Working…") : confirm ? (confirmLabel ?? `Yes, ${label.toLowerCase()}`) : label}
            </button>
          </>
        )}
      </div>

      {state.status !== "idle" && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`mt-2 text-xs ${state.status === "error" ? "text-[#b42318]" : "text-[#006300]"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
