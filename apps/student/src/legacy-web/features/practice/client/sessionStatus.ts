import type { PracticeStatusResponse } from "@/lib/practice/clientApi";

export type SessionHistoryRow = PracticeStatusResponse["history"] extends Array<infer T>
    ? T
    : never;

export type SessionStatus = PracticeStatusResponse;

export async function getSessionStatus(
    sessionId: string,
    opts?: {
      includeMissed?: boolean;
      includeHistory?: boolean;
      subject?: string;
      module?: string;
    },
): Promise<SessionStatus | null> {
  const qs = new URLSearchParams();
  qs.set("sessionId", sessionId);
  qs.set("statusOnly", "true");

  if (opts?.subject) qs.set("subject", opts.subject);
  if (opts?.module) qs.set("module", opts.module);

  if (opts?.includeMissed) qs.set("includeMissed", "true");
  if (opts?.includeHistory) qs.set("includeHistory", "true");

  const res = await fetch(`/api/practice?${qs.toString()}`, { cache: "no-store" });

  if (res.status === 402) return null;
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  return data ? (data as SessionStatus) : null;
}