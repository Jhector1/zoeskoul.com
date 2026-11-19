/** Browser-local recovery policy. It owns no credentials, URLs, or source. */

export type DevelopmentRecoveryDecision = Readonly<{
  attempt: number;
  retry: boolean;
  delayMs: number | null;
}>;

export function createDevelopmentRecoveryCircuit(input: Readonly<{
  maxFailures: number;
  baseDelayMs: number;
  maxDelayMs: number;
}>) {
  if (!Number.isSafeInteger(input.maxFailures) || input.maxFailures < 1 ||
      !Number.isSafeInteger(input.baseDelayMs) || input.baseDelayMs < 1 ||
      !Number.isSafeInteger(input.maxDelayMs) || input.maxDelayMs < input.baseDelayMs)
    throw new Error("Invalid development recovery policy.");
  let projectId: string | null = null;
  let failures = 0;
  let circuitOpen = false;

  function bindProject(nextProjectId: string) {
    if (!nextProjectId) throw new Error("Invalid development recovery project.");
    if (projectId === nextProjectId) return;
    projectId = nextProjectId;
    failures = 0;
    circuitOpen = false;
  }
  function fail(nextProjectId: string): DevelopmentRecoveryDecision {
    bindProject(nextProjectId);
    if (circuitOpen) return {attempt: failures, retry: false, delayMs: null};
    failures++;
    circuitOpen = failures >= input.maxFailures;
    return {
      attempt: failures,
      retry: !circuitOpen,
      delayMs: circuitOpen ? null : Math.min(
        input.maxDelayMs,
        input.baseDelayMs * 2 ** Math.max(0, failures - 1),
      ),
    };
  }
  /** A controller response or open WebSocket is not sufficient. Native mode
   * resets only after the retained iframe is bound and Vite confirms itself. */
  function meaningfulRecovery(nextProjectId: string) {
    if (projectId !== nextProjectId) return false;
    failures = 0;
    circuitOpen = false;
    return true;
  }
  return {
    bindProject, fail, meaningfulRecovery,
    snapshot: () => ({projectId, failures, circuitOpen}) as const,
  };
}

type ClosableSocket = Readonly<{ close(): void }>;
export type DevelopmentSocketFailure = Readonly<{
  handled: boolean;
  retry: boolean;
  attempt: number;
  delayMs: number | null;
  retainedActive: boolean;
}>;

/** Coordinates overlapping ticket rotations. A failed candidate never tears
 * down the still-active socket, and callbacks from retired sockets are inert. */
export function createDevelopmentHmrRotationCoordinator<T extends ClosableSocket>(input: Readonly<{
  maxFailures: number;
  baseDelayMs: number;
  maxDelayMs: number;
}>) {
  if (!Number.isSafeInteger(input.maxFailures) || input.maxFailures < 1 ||
      !Number.isSafeInteger(input.baseDelayMs) || input.baseDelayMs < 1 ||
      !Number.isSafeInteger(input.maxDelayMs) || input.maxDelayMs < input.baseDelayMs)
    throw new Error("Invalid HMR rotation policy.");
  let sequence = 0;
  let latestCandidate = 0;
  let active: Readonly<{id: number; socket: T}> | null = null;
  let failures = 0;
  let closed = false;
  const failed = new Set<number>();

  function beginAttempt() {
    if (closed) return null;
    latestCandidate = ++sequence;
    return latestCandidate;
  }
  function promote(id: number, socket: T) {
    if (closed || id !== latestCandidate || failed.has(id))
      return {accepted: false, retired: null} as const;
    const retired = active?.socket ?? null;
    active = {id, socket};
    return {accepted: true, retired} as const;
  }
  function recordFailure(id: number, socket: T): DevelopmentSocketFailure {
    if (closed || failed.has(id))
      return {handled:false,retry:false,attempt:failures,delayMs:null,retainedActive:Boolean(active)};
    if (active && (active.id !== id || active.socket !== socket)) {
      // A rotation candidate failed while the previous socket is healthy, or
      // a retired socket emitted a late close/error callback.
      if (id === latestCandidate) failed.add(id);
      return {handled:false,retry:false,attempt:failures,delayMs:null,retainedActive:true};
    }
    if (!active && id !== latestCandidate)
      return {handled:false,retry:false,attempt:failures,delayMs:null,retainedActive:false};
    failed.add(id);
    if (active?.id === id && active.socket === socket) active = null;
    failures++;
    const retry = failures <= input.maxFailures;
    return {
      handled:true,retry,attempt:failures,
      delayMs:retry ? Math.min(input.maxDelayMs,
        input.baseDelayMs * 2 ** Math.max(0, failures - 1)) : null,
      retainedActive:false,
    };
  }
  function meaningfulRecovery(id: number, socket: T) {
    if (closed || active?.id !== id || active.socket !== socket) return false;
    failures = 0;
    return true;
  }
  function close() {
    if (closed) return null;
    closed = true;
    sequence++;
    latestCandidate = sequence;
    const socket = active?.socket ?? null;
    active = null;
    return socket;
  }
  return {beginAttempt,promote,recordFailure,meaningfulRecovery,close};
}

/** One browser-controller generation owns exactly one recovery handoff.
 * The existing per-project circuit bounds fresh development admissions.
 * A retry never selects the immutable lane. Once terminal fallback is
 * selected there is no automatic native admission from this handoff. */
export function createDevelopmentRecoveryHandoff(decide:()=>DevelopmentRecoveryDecision) {
  let closed=false;
  return {
    request(): Readonly<{kind:"development";delayMs:number}|{kind:"immutable"}> | null {
      if(closed)return null;
      closed=true;
      const decision=decide();
      return decision.retry && decision.delayMs!==null
        ? {kind:"development",delayMs:decision.delayMs} : {kind:"immutable"};
    },
    close(){closed=true;},
  };
}
