import React from "react";
import type { SqlRunResult } from "@/lib/code/types";
import { Badge } from "./Badge";
import { cn } from "../SqlResultsPane.constants";

export function SqlErrorState(props: {
    result: Extract<SqlRunResult, { ok: false }>;
}) {
    const { result } = props;

    return (
        <div className="flex h-full min-h-0 flex-col rounded-xl border border-rose-300/20 bg-rose-50/70 p-4 dark:border-rose-300/15 dark:bg-rose-950/20">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone="bad">SQL error</Badge>
                <Badge>{result.dialect}</Badge>
                <Badge tone="bad">{result.status}</Badge>
            </div>

            <div className="mt-3 rounded-lg border border-rose-300/20 bg-white/70 p-3 dark:border-rose-300/15 dark:bg-black/20">
                <pre className="whitespace-pre-wrap break-words text-[12px] font-medium text-rose-800 dark:text-rose-200">
                    {result.error ?? result.stderr ?? result.message ?? "Query failed."}
                </pre>
            </div>
        </div>
    );
}
