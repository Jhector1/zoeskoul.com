import type { SessionRecord } from "./sessionStore.js";

// Window keys are routing identities, never credentials. The actor comes from
// service authentication. Retired windows cannot reclaim the IDE via retries.
const WINDOW = /^window-[a-zA-Z0-9-]{8,96}$/;
export function validLearningWindow(value: unknown): value is string {
  return typeof value === "string" && WINDOW.test(value);
}
export function learningWindowFromHost(host: unknown): string | null {
  if (typeof host !== "string") return null;
  const match = /^terminal-host-v2:([^:]+):.+$/.exec(host);
  return match && validLearningWindow(match[1]) ? match[1] : null;
}
export function standardWindowShell(s: SessionRecord, actor: string): string | null {
  if (s.ownerKey !== actor || s.kind !== "shell" || s.labMode !== "standard" || s.finalizedAt != null) return null;
  return learningWindowFromHost(s.clientHostKey);
}
/** Global disposable labs are eligible; signed graded lessons never are. */
export function globalWindowLab(s: SessionRecord, actor: string): boolean {
  return s.ownerKey === actor && s.kind === "shell" && s.labMode === "admin" &&
    s.adminTopicSlug === "full-privileges" && s.finalizedAt == null;
}
export class LearningIdeConflictError extends Error {
  constructor() { super("Existing Linux session requires a user decision."); }
}
export class LearningWindowOwnership {
  private actors = new Map<string, { current: string; retired: Set<string> }>();
  // Called inside the same actor start queue as container admission. No expiry
  // of tombstones while the process lives: a stale tab must not win by waiting.
  claim(actor: string, windowId: string, sessions: SessionRecord[]): SessionRecord[] {
    if (!actor || !validLearningWindow(windowId)) throw new Error("Invalid IDE window identity.");
    const old = this.actors.get(actor);
    if (old?.retired.has(windowId)) throw new Error("IDE superseded. Open a new IDE to take ownership.");
    // An open or disconnected shell may contain live processes or unsaved work.
    // Never change ownership (including reattach authorization) on conflict.
    const conflict = sessions.some(s => {
      if (globalWindowLab(s, actor)) return s.adminWindowId !== windowId;
      if (s.ownerKey !== actor || s.finalizedAt != null || s.kind !== "shell" || s.labMode !== "standard") return false;
      return standardWindowShell(s, actor) !== windowId;
    });
    if (conflict) throw new LearningIdeConflictError();
    const retired = new Set(old?.retired);
    if (old && old.current !== windowId) retired.add(old.current);
    if (retired.size > 512 || (!old && this.actors.size >= 4096)) throw new Error("Runner is busy: IDE ownership capacity reached.");
    this.actors.set(actor, { current: windowId, retired });
    return [];
  }
  status(actor: string, windowId: string): "current" | "superseded" | "unclaimed" {
    const state = this.actors.get(actor);
    if (!state) return "unclaimed";
    return state.current === windowId ? "current" : "superseded";
  }
  /** A window id is routing metadata from the authenticated Web service, not
   * authorization. The caller must separately verify the signed lab grant. */
  assertAdminStart(actor: string, windowId: unknown): string | null {
    const state = this.actors.get(actor);
    if (windowId == null && !state) return null; // legacy client, no claim
    if (!validLearningWindow(windowId) || state?.current !== windowId) {
      throw new Error("IDE superseded. Open a new IDE to take ownership.");
    }
    return windowId;
  }
  allowsAdminSession(actor: string, session: SessionRecord): boolean {
    if (!globalWindowLab(session, actor)) return false;
    const state = this.actors.get(actor);
    return session.adminWindowId == null ? !state :
      validLearningWindow(session.adminWindowId) && state?.current === session.adminWindowId;
  }
  assertStart(actor: string, host: unknown) {
    const windowId = learningWindowFromHost(host);
    const state = this.actors.get(actor);
    // Legacy non-IDE shells have no window identity. Do not change their
    // admission contract; they remain subject to the existing capacity rule.
    if (windowId && state && state.current !== windowId) throw new Error("IDE superseded. Open a new IDE to take ownership.");
  }
}

// Shared by admission, reattachment and input checks. No runtime dependency on Docker.
export const learningWindowOwnership = new LearningWindowOwnership();
