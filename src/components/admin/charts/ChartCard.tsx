"use client";

import { useId, useState, type ReactNode } from "react";

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Every chart's frame: title, an optional caption, the chart, and a table
 * view of exactly the same numbers one click away.
 *
 * The table is not an extra. It is the accessible twin of the chart -- the
 * way a screen-reader user, a colour-blind reader, or anyone who wants the
 * exact figure reads it -- and it is what makes the tooltips optional rather
 * than the only way to get a value.
 */
export default function ChartCard({
  title,
  caption,
  table,
  empty,
  emptyText = "Nothing to chart yet.",
  children,
}: {
  title: string;
  caption?: string;
  table: ChartTable;
  /** True when there is no data worth drawing: an honest message beats an empty axis. */
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  return (
    <figure
      aria-labelledby={titleId}
      className="viz flex min-w-0 flex-col rounded-xl border border-border bg-white p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-sm font-semibold text-foreground">
            {title}
          </h3>
          {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
        </div>
        {!empty && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          >
            {showTable ? "Chart" : "Table"}
          </button>
        )}
      </div>

      <div className="mt-3">
        {empty ? (
          <p className="rounded-lg bg-background py-10 text-center text-sm text-muted">
            {emptyText}
          </p>
        ) : showTable ? (
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col" className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-3 py-1.5 ${j > 0 ? "tabular-nums" : ""}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </figure>
  );
}
