"use client";

import React from "react";
import type { SqlRunResult } from "@/lib/code/types";

function cn(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

function Badge(props: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
    const { children, tone = "neutral" } = props;

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black",
                tone === "neutral" &&
                "border-neutral-200 bg-white text-neutral-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80",
                tone === "good" &&
                "border-emerald-300/30 bg-emerald-300/10 text-emerald-800 dark:text-emerald-200",
                tone === "warn" &&
                "border-amber-300/30 bg-amber-300/10 text-amber-800 dark:text-amber-200",
                tone === "bad" &&
                "border-rose-300/30 bg-rose-300/10 text-rose-800 dark:text-rose-200",
            )}
        >
            {children}
        </span>
    );
}

function CellValue({ value }: { value: unknown }) {
    if (value == null) {
        return (
            <span className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px] font-bold text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/40">
                NULL
            </span>
        );
    }

    if (typeof value === "boolean") {
        return <span>{value ? "true" : "false"}</span>;
    }

    return <span>{String(value)}</span>;
}

export default function SqlResultsPane(props: {
    result: SqlRunResult | null;
    busy: boolean;
    className?: string;
}) {
    const { result, busy, className } = props;

    if (busy) {
        return (
            <div
                className={cn(
                    "flex h-full min-h-0 items-center justify-center rounded-2xl border border-neutral-200/70 bg-white/80 p-6 dark:border-white/10 dark:bg-black/20",
                    className,
                )}
            >
                <div className="text-center">
                    <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                        Running query…
                    </div>
                    <div className="mt-1 text-xs font-semibold text-neutral-500 dark:text-white/50">
                        Executing SQL and preparing result rows
                    </div>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div
                className={cn(
                    "flex h-full min-h-0 items-center justify-center rounded-2xl border border-dashed border-neutral-200/70 bg-white/80 p-6 dark:border-white/10 dark:bg-black/20",
                    className,
                )}
            >
                <div className="text-center">
                    <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                        No SQL result yet
                    </div>
                    <div className="mt-1 text-xs font-semibold text-neutral-500 dark:text-white/50">
                        Run the query to view rows, columns, notices, and execution details.
                    </div>
                </div>
            </div>
        );
    }

    if (!result.ok) {
        return (
            <div
                className={cn(
                    "flex h-full min-h-0 flex-col rounded-2xl border border-rose-300/30 bg-rose-50/70 p-4 dark:border-rose-300/20 dark:bg-rose-950/20",
                    className,
                )}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="bad">SQL error</Badge>
                    <Badge>{result.dialect}</Badge>
                    <Badge tone="bad">{result.status}</Badge>
                </div>

                <div className="mt-3 rounded-xl border border-rose-300/25 bg-white/70 p-3 dark:border-rose-300/15 dark:bg-black/20">
                    <pre className="whitespace-pre-wrap break-words text-xs font-semibold text-rose-800 dark:text-rose-200">
                        {result.error ?? result.stderr ?? result.message ?? "Query failed."}
                    </pre>
                </div>
            </div>
        );
    }

    const columns = result.columns ?? [];
    const rows = result.rows ?? [];
    const hasGrid = columns.length > 0;

    return (
        <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone="good">{result.status}</Badge>
                <Badge>{result.dialect}</Badge>

                {typeof result.rowCount === "number" ? (
                    <Badge>{result.rowCount} row{result.rowCount === 1 ? "" : "s"}</Badge>
                ) : null}

                {typeof result.affectedRows === "number" ? (
                    <Badge>{result.affectedRows} affected</Badge>
                ) : null}

                {result.time ? <Badge>{result.time}s</Badge> : null}
            </div>

            {result.notices?.length ? (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-50/70 p-3 dark:border-amber-300/20 dark:bg-amber-950/20">
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-amber-800 dark:text-amber-200">
                        Notices
                    </div>
                    <div className="space-y-1">
                        {result.notices.map((n, i) => (
                            <div
                                key={i}
                                className="text-xs font-semibold text-amber-800 dark:text-amber-200"
                            >
                                {n}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {hasGrid ? (
                <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-neutral-200/70 bg-white/85 dark:border-white/10 dark:bg-black/20">
                    <div className="h-full overflow-auto">
                        <table className="min-w-full border-collapse">
                            <thead className="sticky top-0 z-10 bg-neutral-100/95 backdrop-blur dark:bg-neutral-900/95">
                            <tr>
                                {columns.map((col, i) => (
                                    <th
                                        key={`${col.name}-${i}`}
                                        className="border-b border-neutral-200 px-3 py-2 text-left text-[11px] font-black uppercase tracking-[0.12em] text-neutral-600 dark:border-white/10 dark:text-white/55"
                                    >
                                        <div className="flex min-w-[120px] items-center gap-2">
                                            <span className="truncate">{col.name}</span>
                                            {col.type ? (
                                                <span className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-neutral-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/40">
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
                                        className="px-4 py-8 text-center text-sm font-semibold text-neutral-500 dark:text-white/45"
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
                <div className="rounded-2xl border border-neutral-200/70 bg-white/85 p-4 dark:border-white/10 dark:bg-black/20">
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-500 dark:text-white/45">
                        Output
                    </div>
                    <div className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-neutral-800 dark:text-white/85">
                        {result.stdout ?? "Statement completed."}
                    </div>
                </div>
            )}
        </div>
    );
}