export type RemoteWebPreviewState =
    | "starting"
    | "ready"
    | "syncing"
    | "error";

export type RemoteWebPreviewRoute = Readonly<{ path: string; label: string }>;

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
}>;
