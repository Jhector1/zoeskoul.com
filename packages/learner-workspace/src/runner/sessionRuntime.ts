// Canonical browser terminal-session transport policy.
// Web and Student must consume this owner instead of maintaining copies.

export type TerminalConnectionState =
    | "idle"
    | "connecting"
    | "connected"
    | "disconnected";

export const TERMINAL_SOCKET_STALE_MS = 45_000;
