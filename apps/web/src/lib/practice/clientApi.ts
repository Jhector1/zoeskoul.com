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

export async function fetchPracticeExercise(
    args: PracticeGetRequest & { signal?: AbortSignal },
): Promise<PracticeGetResponse> {
  const url = buildPracticeUrl(args);

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: args.signal,
  });

  const data = (await readJsonSafe(res)) as PracticeGetResponse & {
    explanation?: string | null;
    message?: string | null;
  };

  if (!res.ok) {
    throw new Error(
        data?.explanation ??
        data?.message ??
        `Failed (${res.status})`,
    );
  }

  return data;
}

export type PracticeSubmitRequest = {
  key: string;
  answer?: any;
  reveal?: boolean;
  signal?: AbortSignal;
};

export async function submitPracticeAnswer(
    args: PracticeSubmitRequest,
): Promise<PracticeValidateClientResponse> {
  const res = await fetch(`/api/practice/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: args.signal,
    body: JSON.stringify({
      key: args.key,
      reveal: args.reveal ? true : undefined,
      answer: args.reveal ? undefined : args.answer,
    }),
  });

  const data = (await readJsonSafe(res)) as PracticeValidateClientResponse & {
    explanation?: string | null;
    message?: string | null;
  };

  if (!res.ok) {
    throw new Error(
        data?.explanation ??
        data?.message ??
        `Failed (${res.status})`,
    );
  }

  return data;
}