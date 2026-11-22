import type { SessionRecord } from "./sessionStore.js";

/** Only the supervised disposable Learning deployment uses capacity takeover. */
export function learningSessionTakeoverEnabled(env: Record<string, string | undefined>): boolean {
  return env.RUNNER_EXECUTION_POOL === "zoeskoul-learning" &&
    env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE === "development";
}

// Ordinary terminals get a short remount grace; administrator transport has
// a longer bounded automatic reconnect budget. Neither is an activity touch.
export const STANDARD_DETACH_GRACE_MS = 30_000;
export const ADMIN_DETACH_GRACE_MS = 120_000;

export function mayReclaimDetachedShell(session: SessionRecord, actor: string, now: number): boolean {
  if (!actor || session.ownerKey !== actor || session.kind !== "shell" ||
      !["waiting_for_input", "running"].includes(session.state) ||
      session.finalizedAt != null || !session.containerId) return false;
  const globalAdmin = session.labMode === "admin" && session.adminTopicSlug === "full-privileges";
  if (session.labMode !== "standard" && !globalAdmin) return false;
  const detached = session.transportDetachedAt;
  return typeof detached === "number" && Number.isSafeInteger(detached) &&
    Number.isSafeInteger(now) && detached >= session.createdAt &&
    now - detached >= (globalAdmin ? ADMIN_DETACH_GRACE_MS : STANDARD_DETACH_GRACE_MS);
}

export function planDetachedShellReclamation(args: {
  actor: string; now: number; actorCount: number; globalCount: number;
  actorLimit: number; globalLimit: number; sessions: SessionRecord[];
}): SessionRecord[] {
  const needed = Math.max(0, args.actorCount - args.actorLimit + 1);
  if (!needed || args.globalCount - needed >= args.globalLimit) return [];
  const eligible = args.sessions.filter(s => mayReclaimDetachedShell(s, args.actor, args.now))
    .sort((a,b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  // No destructive partial reclamation when the protected sessions alone
  // exhaust capacity. The normal reserveSessionSlot guard still decides.
  return eligible.length >= needed ? eligible.slice(0, needed) : [];
}

/** Per-actor serialization of all new starts, including code and signed labs. */
export class LearningStartQueue {
  private tails = new Map<string, Promise<void>>();
  run<T>(actor: string, task: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(actor) ?? Promise.resolve()).then(task);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(actor, tail);
    return result.finally(() => {
      if (this.tails.get(actor) === tail) this.tails.delete(actor);
    });
  }
}

type ReclaimDeps = {
  readPlan: () => Parameters<typeof planDetachedShellReclamation>[0];
  readSession: (id: string) => SessionRecord | null;
  retire: (session: SessionRecord) => Promise<void>;
};

/** Called only inside the per-actor start queue. Keep a cleanup barrier if
 * teardown fails after capacity was logically released. A later start must
 * independently verify the same resources rather than trust the registry count.
 */
export class LearningCapacityRecovery {
  private pending = new Map<string, Map<string, SessionRecord>>();
  async retireOwned(actor: string, session: SessionRecord, retire: ReclaimDeps["retire"]): Promise<void> {
    if (!actor || session.ownerKey !== actor) throw new Error("Invalid learning capacity owner.");
    const outstanding = this.pending.get(actor) ?? new Map<string, SessionRecord>();
    outstanding.set(session.id, session);
    this.pending.set(actor, outstanding);
    try {
      await retire(session);
      outstanding.delete(session.id);
      if (!outstanding.size) this.pending.delete(actor);
    } catch {
      throw new Error("Runner is busy: previous terminal cleanup could not be verified.");
    }
  }
  async recover(actor: string, deps: ReclaimDeps, allowReclaim = true): Promise<void> {
    const outstanding = this.pending.get(actor);
    for (const previous of [...(outstanding?.values() ?? [])]) {
      await this.retireOwned(actor, previous, deps.retire);
    }
    if (!allowReclaim) return;
    const plan = deps.readPlan();
    if (plan.actor !== actor) throw new Error("Invalid learning capacity owner.");
    for (const candidate of planDetachedShellReclamation(plan)) {
      const current = deps.readSession(candidate.id);
      // An attach may occur while another victim is being removed. Recheck
      // identity and transport immediately before starting synchronous teardown.
      if (current !== candidate || !mayReclaimDetachedShell(current, actor, deps.readPlan().now)) break;
      await this.retireOwned(actor, current, deps.retire);
    }
  }
}
