import { getLearnerWorkspaceEnv, getLearnerWorkspaceStaticConfig } from "@zoeskoul/learner-workspace/runtime/staticConfig";
import type {
    CodeRunnerRuntime,
    ResolvedCodeRunnerRuntime,
    TerminalView,
} from "@zoeskoul/learner-workspace/runner/runtime";

function getEnvTerminalView(): Exclude<TerminalView, "auto"> | undefined {
    const value = getLearnerWorkspaceEnv("NEXT_PUBLIC_TERMINAL_MODE")?.trim().toLowerCase();
    if (value === "xterm") return "xterm";
    if (value === "plain") return "plain";
    return undefined;
}

export function resolveRuntime(
    runtime?: CodeRunnerRuntime,
): ResolvedCodeRunnerRuntime {
    const backend = runtime?.backend ?? "pty";

    const explicit = runtime?.terminalView;
    const fromEnv = getEnvTerminalView();

    const terminalView =
        explicit && explicit !== "auto"
            ? explicit
            : fromEnv
                ? fromEnv
                : backend === "judge0"
                    ? "plain"
                    : "xterm";

    return {
        backend,
        terminalView,
    };
}