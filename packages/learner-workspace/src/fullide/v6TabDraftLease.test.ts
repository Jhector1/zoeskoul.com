import { describe, expect, it } from "vitest";
import { startV6TabDraftLease, V6_DRAFT_TAB_KEY } from "./v6TabDraftLease";

type Message = { kind: "probe" | "occupied"; id: string; nonce: string; target?: string };
function fakeStore(initial?: string) {
    const map = new Map<string, string>();
    if (initial) map.set(V6_DRAFT_TAB_KEY, initial);
    return {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => { map.set(key, value); },
    };
}
function bus() {
    const channels = new Set<any>();
    return () => {
        const handlers = new Set<(event: { data: unknown }) => void>();
        const channel = {
            postMessage(message: Message) {
                for (const other of channels) if (other !== channel) {
                    for (const callback of other.handlers) callback({data: message});
                }
            },
            addEventListener(_t: "message", cb: (event: { data: unknown }) => void) { handlers.add(cb); },
            removeEventListener(_t: "message", cb: (event: { data: unknown }) => void) { handlers.delete(cb); },
            close() { channels.delete(channel); },
            handlers,
        };
        channels.add(channel);
        return channel;
    };
}
const seed = "original-tab-identity-0001";
const delay = 8;

describe("V6 tab-isolated recoverable draft lease", () => {
    it("keeps an existing tab identity across refresh when its previous lease is closed", async () => {
        const storage = fakeStore(seed);
        const createChannel = bus();
        const first = startV6TabDraftLease({storage, makeChannel: createChannel, locks: null, makeId: () => "nonce-first-001", settleMs: delay});
        expect((await first.ready).id).toBe(seed);
        first.close();
        const second = startV6TabDraftLease({storage, makeChannel: createChannel, locks: null, makeId: () => "nonce-second-002", settleMs: delay});
        expect((await second.ready).id).toBe(seed);
        second.close();
    });
    it("rotates a duplicated tab ID while preserving a copy source", async () => {
        const createChannel = bus();
        const first = startV6TabDraftLease({storage: fakeStore(seed), makeChannel: createChannel, locks: null, makeId: () => "aaa-original-0001", settleMs: delay});
        expect((await first.ready).id).toBe(seed);
        let next = 0;
        const cloned = startV6TabDraftLease({storage: fakeStore(seed), makeChannel: createChannel, locks: null,
            makeId: () => ["zzz-clone-00001", "fresh-clone-id-0001"][next++]!, settleMs: delay});
        expect(await cloned.ready).toEqual({id: "fresh-clone-id-0001", inheritedFromId: seed});
        first.close(); cloned.close();
    });
    it("chooses distinct IDs on simultaneous clones via the nonce tie-break", async () => {
        const createChannel = bus();
        let next = 0;
        const a = startV6TabDraftLease({storage: fakeStore(seed), makeChannel: createChannel, locks: null, makeId: () => "aaa-tie-break-0001", settleMs: delay});
        const b = startV6TabDraftLease({storage: fakeStore(seed), makeChannel: createChannel, locks: null,
            makeId: () => ["zzz-tie-break-0002", "fresh-simul-id-0002"][next++]!, settleMs: delay});
        const [ia, ib] = await Promise.all([a.ready, b.ready]);
        expect(ia.id).not.toBe(ib.id);
        a.close(); b.close();
    });
    it("falls back to a fresh per-mount key without BroadcastChannel", async () => {
        const lease = startV6TabDraftLease({storage: fakeStore(seed), makeChannel: () => null, locks: null,
            makeId: () => "safe-mount-id-0001"});
        expect(await lease.ready).toEqual({id: "safe-mount-id-0001", inheritedFromId: seed});
        lease.close();
    });
    it("uses atomic Web Locks so simultaneous cloned tabs cannot share a key", async () => {
        const held = new Set<string>();
        const locks = {
            async request(name: string, _opts: {ifAvailable: true; mode: "exclusive"},
                callback: (lock: unknown | null) => Promise<void>) {
                if (held.has(name)) { await callback(null); return; }
                held.add(name);
                try { await callback({name}); } finally { held.delete(name); }
            },
        };
        const one = startV6TabDraftLease({storage: fakeStore(seed), locks,
            makeId: () => "first-lock-nonce-0001"});
        expect((await one.ready).id).toBe(seed);
        let next = 0;
        const other = startV6TabDraftLease({storage: fakeStore(seed), locks,
            makeId: () => ["second-lock-nonce-0002", "fresh-web-lock-id-0002"][next++]!});
        expect(await other.ready).toEqual({id: "fresh-web-lock-id-0002", inheritedFromId: seed});
        one.close(); other.close();
    });
    it("does not inherit drafts across other actors by itself", async () => {
        const lease = startV6TabDraftLease({storage: fakeStore(), makeChannel: () => null, locks: null,
            makeId: () => "new-draft-tab-0001"});
        expect((await lease.ready).id).toBe("new-draft-tab-0001");
        lease.close();
    });
});
