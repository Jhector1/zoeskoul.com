/**
 * V6-only: reserve a browser-tab draft namespace. A duplicated Chrome tab may
 * inherit sessionStorage; the BroadcastChannel probe prevents two mounted IDEs
 * from writing to the same IndexedDB draft key.
 *
 * This is NOT a security boundary: the server owns identity and project versions.
 */
export const V6_DRAFT_TAB_KEY = "zoeskoul:v6:draft-tab-id:v1";
export const V6_DRAFT_CHANNEL = "zoeskoul:v6:draft-tab-lease:v1";

type Message = { kind: "probe" | "occupied"; id: string; nonce: string; target?: string };
export type LeaseIdentity = { id: string; inheritedFromId: string | null };
type Channel = {
    postMessage(message: Message): void;
    addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
    removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
    close(): void;
};
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type LeaseEnvironment = {
    storage?: StorageLike | null;
    makeChannel?: () => Channel | null;
    makeId?: () => string;
    settleMs?: number;
    /** Separate multiple IDEs mounted on one page by their workspace scope. */
    namespace?: string;
    /** Optional injected Web Lock manager for deterministic tests. */
    locks?: {
        request(name: string, options: {ifAvailable: true; mode: "exclusive"},
            callback: (lock: unknown | null) => Promise<void>): Promise<void>;
    } | null;
};

function randomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validId(value: string | null): value is string {
    return !!value && /^[a-zA-Z0-9-]{10,128}$/.test(value);
}

export function startV6TabDraftLease(env: LeaseEnvironment = {}): {
    ready: Promise<LeaseIdentity>;
    close: () => void;
} {
    const makeId = env.makeId ?? randomId;
    let store: StorageLike | null = env.storage ?? null;
    if (env.storage === undefined) {
        try { store = typeof window !== "undefined" ? window.sessionStorage : null; }
        catch { store = null; }
    }
    const namespace = env.namespace ? `:${encodeURIComponent(env.namespace)}` : "";
    const storageKey = V6_DRAFT_TAB_KEY + namespace;
    const channelName = V6_DRAFT_CHANNEL + namespace;
    let initial: string | null = null;
    try { initial = store?.getItem(storageKey) ?? null; } catch { /* private mode */ }
    let id = validId(initial) ? initial : makeId();
    let inheritedFromId: string | null = null;
    const nonce = makeId();
    const storeId = () => {
        try { store?.setItem(storageKey, id); } catch { /* keep memory-only */ }
    };

    // Chrome's Web Locks are a cross-tab atomic ownership primitive: unlike
    // a timed message exchange, two live tabs cannot acquire the same key.
    // Retain BroadcastChannel below for browsers without the Locks API.
    const locks = env.locks === undefined
        ? typeof navigator !== "undefined" && "locks" in navigator
            ? navigator.locks as unknown as NonNullable<LeaseEnvironment["locks"]>
            : null
        : env.locks;
    if (locks) {
        let closed = false;
        let release = () => {};
        let resolveReady: (value: LeaseIdentity) => void = () => {};
        const ready = new Promise<LeaseIdentity>(resolve => { resolveReady = resolve; });
        const reserve = async () => {
            while (!closed) {
                const name = `${V6_DRAFT_CHANNEL}:${namespace}:${id}`;
                let decide: (result: boolean) => void = () => {};
                const decision = new Promise<boolean>(resolve => { decide = resolve; });
                const hold = new Promise<void>(resolve => { release = resolve; });
                let lockError = false;
                try {
                    void locks.request(name, {ifAvailable: true, mode: "exclusive"}, async lock => {
                        decide(!!lock);
                        if (lock) await hold;
                    }).catch(() => { lockError = true; decide(false); });
                } catch { lockError = true; decide(false); }
                if (await decision) {
                    if (closed) { release(); return; }
                    storeId();
                    resolveReady({id, inheritedFromId});
                    return;
                }
                if (!inheritedFromId) inheritedFromId = id;
                id = makeId();
                storeId();
                if (lockError) {
                    // If the browser rejects Web Locks entirely, fall back to
                    // a distinct per-mount ID, never the contested old key.
                    if (!closed) resolveReady({id, inheritedFromId});
                    return;
                }
            }
        };
        void reserve();
        return {ready, close() { closed = true; release(); }};
    }

    let channel: Channel | null = null;
    try {
        channel = env.makeChannel ? env.makeChannel() :
            typeof BroadcastChannel !== "undefined"
                ? new BroadcastChannel(channelName) as unknown as Channel
                : null;
    } catch { channel = null; }
    // Without a channel there can be no duplicate-tab handshake. Choose a
    // fresh per-mount ID instead of risking concurrent writes to the old key.
    if (!channel && validId(initial)) {
        inheritedFromId = id;
        id = makeId();
    }
    storeId();
    let closed = false;
    let active = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let finish: (identity: LeaseIdentity) => void = () => {};
    const ready = new Promise<LeaseIdentity>((resolve) => { finish = resolve; });
    const finishProbe = () => {
        if (closed) return;
        active = true;
        finish({ id, inheritedFromId });
    };
    const rotate = () => {
        if (!inheritedFromId) inheritedFromId = id;
        id = makeId();
        storeId();
        active = false;
        channel?.postMessage({kind: "probe", id, nonce});
        if (timer) clearTimeout(timer);
        timer = setTimeout(finishProbe, env.settleMs ?? 150);
    };
    const onMessage = (event: { data: unknown }) => {
        if (closed || !event.data || typeof event.data !== "object") return;
        const incoming = event.data as Partial<Message>;
        if (!validId(incoming.id ?? null) || incoming.id !== id ||
            typeof incoming.nonce !== "string" || incoming.nonce === nonce) return;
        if (incoming.kind === "probe") {
            if (active) {
                channel?.postMessage({kind: "occupied", id, nonce, target: incoming.nonce});
            } else if (nonce > incoming.nonce) {
                rotate();
            } else {
                // Both probes may begin before either tab receives the first
                // packet. Repeat the winning claim so the other tab rotates.
                channel?.postMessage({kind: "probe", id, nonce});
            }
        } else if (incoming.kind === "occupied" && incoming.target === nonce) {
            if (!active || nonce > incoming.nonce) rotate();
        }
    };
    channel?.addEventListener("message", onMessage);
    if (channel) {
        channel.postMessage({kind: "probe", id, nonce});
        timer = setTimeout(finishProbe, env.settleMs ?? 150);
    } else {
        finishProbe();
    }
    return {
        ready,
        close() {
            closed = true;
            if (timer) clearTimeout(timer);
            channel?.removeEventListener("message", onMessage);
            channel?.close();
        },
    };
}
