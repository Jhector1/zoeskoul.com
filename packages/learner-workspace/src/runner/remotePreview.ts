export type RemoteWebPreviewState =
    | "starting"
    | "ready"
    | "syncing"
    | "error";

export type RemoteWebPreviewRoute = Readonly<{ path: string; label: string }>;
export type RemoteWebPreviewTimingKind = "cold" | "restart" | "reuse" | "reopen" | "navigation" | "refresh";
export type RemoteWebPreviewTimingEvent = Readonly<{
    stage: "document_response" | "stylesheet_delivery" | "javascript_delivery" |
        "document_to_rendered" | "intent_to_rendered";
    kind: RemoteWebPreviewTimingKind;
    outcome: "ok" | "unavailable";
    durationMs?: number;
}>;

export type RemoteWebPreviewDescriptor = Readonly<{
    /** Registered project pages, never inferred from the currently rendered DOM. */
    routes?: readonly RemoteWebPreviewRoute[];
    /** Same-origin app proxy URL. Never expose a runner origin or host port. */
    src: string | null;
    title?: string;
    state: RemoteWebPreviewState;
    message?: string | null;
    revision: number;
    onRetry?: (() => void) | null;
    /** Numeric-only browser diagnostics. No project, capability, URL, or user
     * identity may be attached to this callback. */
    observability?: Readonly<{
        kind: Exclude<RemoteWebPreviewTimingKind, "navigation" | "refresh">;
        intentStartedAt: number;
        onTiming(event: RemoteWebPreviewTimingEvent): void;
    }>;
}>;
