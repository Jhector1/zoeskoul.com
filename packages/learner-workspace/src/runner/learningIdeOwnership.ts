export type IdeOwnershipResult = "current" | "superseded" | "conflict" | "unavailable";
type ClaimFetch = typeof fetch;

/** A status read is never a claim. No retries run in the background. */
export async function requestIdeOwnership(windowId: string, intent: "claim" | "status", fetcher: ClaimFetch = fetch): Promise<IdeOwnershipResult> {
    try {
        const response = await fetcher("/api/run/pty/sessions/ide/claim", {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(intent === "claim" ? {windowId} : {windowId, intent: "status"}),
            signal: AbortSignal.timeout(30_000),
        });
        if (response.status === 423) return intent === "claim" ? "conflict" : "unavailable";
        if (response.status === 409) return "superseded";
        if (!response.ok) return "unavailable";
        const body = await response.json();
        if (body?.ok !== true || typeof body.enabled !== "boolean") return "unavailable";
        if (!body.enabled) return intent === "claim" ? "unavailable" : "superseded";
        if (intent === "claim") return "current";
        if (body.status === "current") return "current";
        if (body.status === "superseded" || body.status === "unclaimed") return "superseded";
        return "unavailable";
    } catch { return "unavailable"; }
}

// Shared within a single document. React remounts never create a second claim.
// The server remains authoritative and checks the actor on every operation.
export class IdeOwnershipGate {
    private flight: Promise<IdeOwnershipResult> | null = null;
    private result: IdeOwnershipResult | null = null;
    constructor(private readonly windowId: string, private readonly fetcher?: ClaimFetch) {}
    claim(retry = false): Promise<IdeOwnershipResult> {
        if (this.flight) return this.flight;
        if (this.result && !(retry && (this.result === "unavailable" || this.result === "conflict"))) return Promise.resolve(this.result);
        const flight = requestIdeOwnership(this.windowId, "claim", this.fetcher).then(result => {
            if (this.result === "superseded") return this.result;
            this.result = result;
            return result;
        }).finally(() => { if (this.flight === flight) this.flight = null; });
        this.flight = flight;
        return flight;
    }
    async check(): Promise<IdeOwnershipResult> {
        if (this.result !== "current") return this.result ?? "unavailable";
        const result = await requestIdeOwnership(this.windowId, "status", this.fetcher);
        // An older response or network failure cannot revive a superseded IDE.
        if (result === "superseded") this.result = "superseded";
        return this.result as IdeOwnershipResult;
    }
    supersede() { this.result = "superseded"; }
}
const gates = new Map<string, IdeOwnershipGate>();
export function getIdeOwnershipGate(windowId: string): IdeOwnershipGate {
    let gate = gates.get(windowId);
    if (!gate) { gate = new IdeOwnershipGate(windowId); gates.set(windowId, gate); }
    return gate;
}
