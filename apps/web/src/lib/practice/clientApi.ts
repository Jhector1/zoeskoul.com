import { PurposeMode, PurposePolicy } from "@/lib/subjects/types";
import type {
  PracticeGetResponse,
  PracticeStatusResponse,
  PracticeValidateClientResponse,
} from "@/lib/practice/apiTypes";

export type {
  PracticeGetResponse,
  PracticeStatusResponse,
  PracticeValidateClientResponse,
};

async function readJsonSafe(res: Response) {
  const text = await res.text();

  if (!text) {
    throw new Error(`Empty response body (status ${res.status})`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
        `Non-JSON response (status ${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

export type SeedPolicy = "actor" | "global";

const practiceGetInFlight = new Map<string, Promise<PracticeGetResponse>>();

function isAbortLikeError(error: unknown) {
  return (
      (error instanceof DOMException && error.name === "AbortError") ||
      String((error as any)?.name ?? "") === "AbortError"
  );
}

export type PracticeGetRequest = {
  subject?: string;
  module?: string;
  topic?: string;
  difficulty?: string;
  section?: string;
  allowReveal?: boolean;
  sessionId?: string;
  preferKind?: string;

  preferPurpose?: PurposeMode;
  purposePolicy?: PurposePolicy;

  salt?: string;
  exerciseKey?: string;
  seedPolicy?: SeedPolicy;

  statusOnly?: boolean;
  includeMissed?: boolean;
  includeHistory?: boolean;
};

function buildPracticeUrl(args: PracticeGetRequest) {
  const sp = new URLSearchParams();

  const set = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (!s) return;
    sp.set(k, s);
  };

  set("subject", args.subject);
  set("module", args.module);
  set("section", args.section);
  set("topic", args.topic);
  set("difficulty", args.difficulty);

  if (args.allowReveal !== undefined) {
    sp.set("allowReveal", args.allowReveal ? "true" : "false");
  }

  set("sessionId", args.sessionId);
  set("preferKind", args.preferKind);

  set("preferPurpose", args.preferPurpose);
  set("purposePolicy", args.purposePolicy);

  set("salt", args.salt);
  set("exerciseKey", args.exerciseKey);
  set("seedPolicy", args.seedPolicy);

  if (args.statusOnly !== undefined) {
    sp.set("statusOnly", args.statusOnly ? "true" : "false");
  }

  if (args.includeMissed !== undefined) {
    sp.set("includeMissed", args.includeMissed ? "true" : "false");
  }

  if (args.includeHistory !== undefined) {
    sp.set("includeHistory", args.includeHistory ? "true" : "false");
  }

  const qs = sp.toString();
  return `/api/practice${qs ? `?${qs}` : ""}`;
}



export type PracticeSubmitRequest = {
  key: string;
  answer?: any;
  reveal?: boolean;
  signal?: AbortSignal;
};


















import type { SubmitAnswer } from "@/lib/practice/types";

// export type PracticeGetResponse = any;
// export type PracticeValidateClientResponse = any;

const practiceSubmitInFlight = new Map<string, Promise<PracticeValidateClientResponse>>();

function stableJsonForPracticeRequest(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonForPracticeRequest(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonForPracticeRequest(record[key])}`)
    .join(",")}}`;
}

export async function fetchPracticeExercise(args: Record<string, any>) {
  const url = new URL("/api/practice", window.location.origin);

  for (const [key, value] of Object.entries(args)) {
    if (
        value === undefined ||
        value === null ||
        value === "" ||
        key === "signal"
    ) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const dedupeKey = url.toString();
  const existing = practiceGetInFlight.get(dedupeKey);
  if (existing) return existing;

  if ((args.signal as AbortSignal | undefined)?.aborted) {
    throw new DOMException("Practice fetch was aborted before it started.", "AbortError");
  }

  const promise = (async () => {
    const res = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      /**
       * Do not pass each caller's AbortSignal into the shared GET. Multiple
       * React effects can ask for the same exercise; one soft timeout/cancel
       * must not abort the canonical request for the other caller. Route/card
       * cleanup is still handled by the caller discarding stale results.
       */
      credentials: "include",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(
          String(data?.message ?? `Practice fetch failed (${res.status}).`),
      );
    }

    return data as PracticeGetResponse;
  })().finally(() => {
    practiceGetInFlight.delete(dedupeKey);
  });

  practiceGetInFlight.set(dedupeKey, promise);

  try {
    return await promise;
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error("Practice fetch was aborted.");
    }
    throw error;
  }
}

export async function submitPracticeAnswer(args: {
  key: string;
  answer?: SubmitAnswer;
  reveal?: boolean;
}) {
  const dedupeKey = stableJsonForPracticeRequest({
    key: args.key,
    answer: args.answer ?? null,
    reveal: Boolean(args.reveal),
  });
  const existing = practiceSubmitInFlight.get(dedupeKey);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch("/api/practice/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        key: args.key,
        ...(args.answer ? { answer: args.answer } : {}),
        ...(args.reveal ? { reveal: true } : {}),
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(
          String(data?.message ?? `Practice validate failed (${res.status}).`),
      );
    }

    return data as PracticeValidateClientResponse;
  })().finally(() => {
    practiceSubmitInFlight.delete(dedupeKey);
  });

  practiceSubmitInFlight.set(dedupeKey, promise);
  return promise;
}

export type PracticeHelpClientResponse = {
  requestId?: string;
  stepKey: string;
  step?: {
    key: string;
    label: string;
    kind: string;
  };
  source?: string | null;
  content?: string | null;
  reveal?: any | null;
};

export async function fetchPracticeHelp(args: {
  key: string;
  stepKey: string;
  userAnswer?: any;
  signal?: AbortSignal;
}): Promise<PracticeHelpClientResponse> {
  const res = await fetch("/api/practice/help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    signal: args.signal,
    body: JSON.stringify({
      key: args.key,
      stepKey: args.stepKey,
      userAnswer: args.userAnswer ?? null,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
        String(data?.message ?? `Practice help failed (${res.status}).`),
    );
  }

  return data as PracticeHelpClientResponse;
}