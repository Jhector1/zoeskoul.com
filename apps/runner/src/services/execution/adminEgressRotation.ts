/** Supervised development only. Serialize all mutations for a session identity.
 * A read-only timeout may abandon a wait, but mutating Docker calls themselves
 * must settle before releasing this queue. Never retry an ambiguous rotation. */
export class AdminEgressOperationQueue {
  private pending = new Map<string, Promise<void>>();
  run<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(id) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.pending.set(id, tail);
    void tail.then(() => { if (this.pending.get(id) === tail) this.pending.delete(id); });
    return result;
  }
}

export type RotationClock = { wallMs: number; monotonicMs: number; deadlineSeconds: number };
/** Start the authorization budget before sidecar creation, never at renewal. */
export function startRotationClock(hardLifetimeMs: number, wallMs = Date.now(), monotonicMs = performance.now()): RotationClock {
  if (!Number.isSafeInteger(hardLifetimeMs) || hardLifetimeMs <= 0 || !Number.isFinite(wallMs) || !Number.isFinite(monotonicMs)) throw new Error("Invalid administrator lifetime.");
  return { wallMs, monotonicMs, deadlineSeconds: Math.floor((wallMs + hardLifetimeMs)/1000) };
}
export function assertRotationClock(clock: RotationClock, wallMs = Date.now(), monotonicMs = performance.now()): void {
  const elapsed = monotonicMs-clock.monotonicMs;
  if (!Number.isFinite(elapsed) || elapsed < 0 || Math.abs(wallMs-clock.wallMs-elapsed) >= 1000 || wallMs >= clock.deadlineSeconds*1000 || clock.wallMs+elapsed >= clock.deadlineSeconds*1000) throw new Error("Administrator rotation clock or deadline invalid.");
}
export function rotationExpiry(previous: number, next: number, deadline: number, now: number): number | null {
  if (![previous,next,deadline,now].every(Number.isSafeInteger) || previous <= now+15 || previous > deadline || next-now < 60 || next-now > 3600) return null;
  const effective = Math.min(next,deadline);
  return previous-now <= 20*60 && effective > previous && effective-now >= 60 ? effective : null;
}
export function parseFirewallFingerprint(text: string): string {
  const match = /^ZOE_FIREWALL_STRUCTURE_SHA256=([a-f0-9]{64})\r?\nZOE_FIREWALL_INSTALLED_AND_VERIFIED$/.exec(text.trim());
  if (!match) throw new Error("Unverified firewall initializer evidence.");
  return match[1];
}
export function verifyFirewallRenewed(text: string, expiry: number): void {
  if (text.trim() !== `ZOE_FIREWALL_RENEWED_AND_VERIFIED expiresAt=${expiry}`) throw new Error("Unverified firewall renewal evidence.");
}
export type RotationSteps = {
  guard: () => void;
  verify: () => Promise<void>;
  quiesce: () => Promise<void>;
  apply: () => Promise<void>;
  replace: () => Promise<void>;
  commit: () => void;
  abort: () => Promise<void>;
};
/** Must be called inside the ownership queue. An ambiguous mutation is never
 * rolled back to an old gateway; tear down the egress resources instead. */
export async function executeRotation(s: RotationSteps): Promise<void> {
  try {
    s.guard(); await s.verify(); s.guard();
    await s.quiesce(); s.guard();
    await s.apply(); s.guard();
    await s.replace(); s.guard();
    s.commit();
  } catch (error) {
    await s.abort(); // cleanup failure propagates; no success is published
    throw error;
  }
}
