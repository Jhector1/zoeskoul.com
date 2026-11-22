/** Explicit, local-only opt-in. The private POST bridge is still the authority
 * on every request; this preflight never opens or transfers an environment. */
export const unifiedSandboxConfig = Object.freeze({
    apiPath: "/api/run/pty/sessions/unified", wsPrefix: "/sessions",
    wsOrigin: "http://127.0.0.1:4317", workspaceRead: true,
} as const);

export function selectUnifiedSandbox(args: {values: string[]; nodeEnv?: string; kind: string;
    toolSlug: string; hasUser: boolean; canUseMultiFile: boolean}): "legacy" | "unified" | "denied" {
    if (args.kind !== "programming" || args.toolSlug !== "python" || !args.values.length) return "legacy";
    return args.values.length === 1 && args.values[0] === "1" && args.nodeEnv === "development" &&
        args.kind === "programming" && args.toolSlug === "python" && args.hasUser && args.canUseMultiFile
        ? "unified" : "denied";
}

export async function admitUnifiedSandbox(origin: string, signal: AbortSignal,
    request: typeof fetch = fetch, newId: () => string = () => crypto.randomUUID()): Promise<boolean> {
    if (origin !== "http://localhost:3000" || signal.aborted) return false;
    try {
        const windowId = "window-" + newId();
        if (!/^window-[a-zA-Z0-9-]{8,96}$/.test(windowId)) return false;
        const response = await request(unifiedSandboxConfig.apiPath, {
            method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
            headers: {"Content-Type": "application/json"}, signal,
            body: JSON.stringify({action: "status", windowId}),
        });
        if (!response.ok || signal.aborted) return false;
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || Array.isArray(result) || signal.aborted) return false;
        const record = result as Record<string, unknown>;
        // Only a successful status response grants UI admission. A conflict
        // remains a conflict: the terminal panel must request explicit transfer.
        return record.ok === true && (record.status === "absent" || record.status === "current" || record.status === "conflict");
    } catch { return false; }
}
