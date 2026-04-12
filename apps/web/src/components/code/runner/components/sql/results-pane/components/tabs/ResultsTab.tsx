
"use client";

import React from "react";
import type { SqlRunResult } from "@/lib/code/types";
import { Badge } from "../Badge";
import { CellValue } from "../CellValue";
import { SURFACE, cn } from "../../SqlResultsPane.constants";

export function ResultsTab(props: { result: Extract<SqlRunResult, { ok: true }> }) {
    const { result } = props;
    const columns = result.columns ?? [];
    const rows = result.rows ?? [];
    const hasGrid = columns.length > 0;

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone="good">{result.status}</Badge>
                <Badge>{result.dialect}</Badge>
                {typeof result.rowCount === "number" ? (
                    <Badge>
                        {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
                    </Badge>
                ) : null}
                {typeof result.affectedRows === "number" ? (
                    <Badge>{result.affectedRows} affected</Badge>
                ) : null}
                {result.time ? <Badge>{result.time}s</Badge> : null}
            </div>

            {result.notices?.length ? (
                <div className="rounded-xl border border-amber-300/20 bg-amber-50/70 p-3 dark:border-amber-300/15 dark:bg-amber-950/20">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-amber-800 dark:text-amber-200">
                        Notices
                    </div>
                    <div className="space-y-1">
                        {result.notices.map((n, i) => (
                            <div
                                key={i}
                                className="text-[12px] font-medium text-amber-800 dark:text-amber-200"
                            >
                                {n}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {hasGrid ? (
                <div className={cn("min-h-0 flex-1 overflow-hidden", SURFACE)}>
                    <div className="h-full overflow-auto">
                        <table className="min-w-full border-collapse">
                            <thead className="sticky top-0 z-10 bg-neutral-100/95 backdrop-blur dark:bg-neutral-900/95">
                            <tr>
                                {columns.map((col, i) => (
                                    <th
                                        key={`${col.name}-${i}`}
                                        className="border-b border-neutral-200 px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500 dark:border-white/10 dark:text-white/50"
                                    >
                                        <div className="flex min-w-[120px] items-center gap-2">
                                            <span className="truncate">{col.name}</span>
                                            {col.type ? (
                                                <span className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-neutral-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/40">
                                                        {col.type}
                                                    </span>
                                            ) : null}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                            </thead>

                            <tbody>
                            {rows.length ? (
                                rows.map((row, ri) => (
                                    <tr
                                        key={ri}
                                        className={cn(
                                            "border-b border-neutral-200/70 last:border-b-0 dark:border-white/10",
                                            ri % 2 === 0
                                                ? "bg-white/70 dark:bg-transparent"
                                                : "bg-neutral-50/70 dark:bg-white/[0.02]",
                                        )}
                                    >
                                        {columns.map((_, ci) => (
                                            <td
                                                key={`${ri}-${ci}`}
                                                className="max-w-[420px] px-3 py-2 align-top text-xs font-medium text-neutral-800 dark:text-white/85"
                                            >
                                                <div className="break-words font-mono leading-5">
                                                    <CellValue value={row[ci]} />
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td
                                        colSpan={Math.max(1, columns.length)}
                                        className="px-4 py-8 text-center text-sm font-medium text-neutral-500 dark:text-white/45"
                                    >
                                        Query returned no rows.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className={cn("p-4", SURFACE)}>
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                        Output
                    </div>
                    <div className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-neutral-800 dark:text-white/85">
                        {result.stdout ?? "Statement completed."}
                    </div>
                </div>
            )}
        </div>
    );
}
