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

  const res = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    signal: args.signal,
    credentials: "include",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
        String(data?.message ?? `Practice fetch failed (${res.status}).`),
    );
  }

  return data as PracticeGetResponse;
}

export async function submitPracticeAnswer(args: {
  key: string;
  answer?: SubmitAnswer;
  reveal?: boolean;
}) {
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