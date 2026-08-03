"use client";

import type {
    SharedRunnerArgs,
    CodeRunnerController,
    ResolvedCodeRunnerRuntime,
} from "../../runtime";
import { resolveRuntime } from "./useResolvedRuntime";
import { useJudge0Runner } from "../judge0/useJudge0Runner";
import { usePtyRunner } from "../pty/usePtyRunner";

function resolveEffectiveRuntime(args: SharedRunnerArgs): ResolvedCodeRunnerRuntime {
    const requested = resolveRuntime(args.runtime);

    if (args.lang === "sql") {
        return {
            backend: "judge0",
            terminalView: "plain",
        };
    }

    if (args.isAuthenticated === false && requested.backend === "pty") {
        return {
            backend: "judge0",
            terminalView: "plain",
        };
    }

    return requested;
}

export function useCodeRunnerController(args: SharedRunnerArgs): CodeRunnerController {
    const effectiveRuntime = resolveEffectiveRuntime(args);

    const judge0Controller = useJudge0Runner({
        ...args,
        runtime: {
            backend: "judge0",
            terminalView: "plain",
        },
    });

    const ptyController = usePtyRunner({
        ...args,
        runtime: {
            backend: "pty",
            terminalView:
                effectiveRuntime.terminalView === "plain" ? "plain" : "xterm",
        },
    });

    if (effectiveRuntime.backend === "judge0") {
        return judge0Controller;
    }

    return ptyController;
}