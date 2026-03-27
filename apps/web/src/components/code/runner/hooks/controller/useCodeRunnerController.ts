"use client";

import type { SharedRunnerArgs, CodeRunnerController } from "../../runtime";
import { resolveRuntime } from "./useResolvedRuntime";
import { useJudge0Runner } from "../judge0/useJudge0Runner";
import { usePtyRunner } from "../pty/usePtyRunner";

export function useCodeRunnerController(args: SharedRunnerArgs): CodeRunnerController {
    const runtime = resolveRuntime(args.runtime);
    const { lang } = args;

    if (lang === "sql") {
        return useJudge0Runner({
            ...args,
            runtime: {
                backend: "judge0",
                terminalView: "plain",
            },
        });
    }

    const nonSqlArgs = {
        ...args,
        lang,
        runtime,
    };

    if (runtime.backend === "judge0") {
        return useJudge0Runner(nonSqlArgs);
    }

    return usePtyRunner(nonSqlArgs);
}