"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// AFTER (accept both shapes to be safe)
type AssignmentTopic =
  | string
  | { id?: string; slug: string; titleKey?: string };

type Assignment = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty: "easy" | "medium" | "hard";

  // ✅ support both old + new API
  topics: AssignmentTopic[];
  topicSlugs?: string[];

  questionCount: number;
  availableFrom: string | null;
  dueAt: string | null;
  timeLimitSec: number | null;
  allowReveal: boolean;
  showDebug: boolean;
  maxAttempts: number | null;
  attemptsUsed?: number;
  attemptsRemaining?: number | null;
};

function topicSlug(t: AssignmentTopic): string {
  return typeof t === "string" ? t : String(t.slug ?? "");
}

function topicLabel(t: AssignmentTopic): string {
  return typeof t === "string" ? t : String(t.slug ?? "");
}

const badge = (txt: string) =>
  "rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-extrabold text-white/70";

function billingUrl(nextPath: string) {
  return `/billing?next=${encodeURIComponent(nextPath)}`;
}

export default function AssignmentsPage() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [busy, setBusy] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      setBusy(true);
      try {
        const r = await fetch("/api/assignments", { cache: "no-store" });

        // ✅ handle paywall
        if (!r.ok) {
          let data: any = null;
          try {
            data = await r.json();
          } catch {}
          if (r.status === 402 || data?.code === "NOT_ENTITLED") {
            router.replace(billingUrl("/assignments"));
            return;
          }
        }

        const data = await r.json();
        setItems(data.assignments ?? []);
      } finally {
        setBusy(false);
      }
    })();
  }, [router]);

  const start = async (a: Assignment) => {
    const r = await fetch(`/api/assignments/${a.id}/start`, { method: "POST" });

    let data: any = null;
    try {
      data = await r.json();
    } catch {
      alert("Unexpected response. Please try again.");
      return;
    }

    // ✅ if not subscribed -> billing
    if (!r.ok) {
      if (r.status === 402 || data?.code === "NOT_ENTITLED") {
        router.push(billingUrl("/assignments"));
        return;
      }
      alert(data?.message ?? "Unable to start.");
      return;
    }

    // ✅ Prefer server-provided topicSlugs if present (best source of truth)
    const slugsFromServer = Array.isArray(data?.topicSlugs)
      ? (data.topicSlugs as string[])
      : null;

    const slugsFromAssignment =
      a.topicSlugs?.length
        ? a.topicSlugs
        : (a.topics ?? []).map(topicSlug);

    const slugs = (slugsFromServer ?? slugsFromAssignment ?? [])
      .map((s) => String(s || "").trim())
      .filter(Boolean);

    const topicsParam = slugs.length ? slugs.join(",") : "all";
    const firstTopic = slugs[0] ?? "all";

    router.push(
      `/practice?sessionId=${encodeURIComponent(data.sessionId)}&type=assignment` +
        `&difficulty=${encodeURIComponent(a.difficulty)}` +
        `&topics=${encodeURIComponent(topicsParam)}` + // ✅ FULL LIST
        `&topic=${encodeURIComponent(firstTopic)}` +   // ✅ fallback / convenience
        `&questionCount=${encodeURIComponent(String(a.questionCount ?? 10))}` +
        `&allowReveal=${encodeURIComponent(String(a.allowReveal))}` +
        `&showDebug=${encodeURIComponent(String(a.showDebug))}`
    );
  };

  return (
    <div className="min-h-screen p-4 md:p-6 bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-white/90">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
          <div className="text-lg font-black tracking-tight">Assignments</div>
          <div className="mt-1 text-sm text-white/70">
            Published assignments your admin has made available.
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {busy ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white/70">
              Loading assignments…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white/70">
              No assignments available right now.
            </div>
          ) : (
            items.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white/90">
                      {a.title}
                    </div>
                    {a.description ? (
                      <div className="mt-1 text-sm text-white/70">
                        {a.description}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={badge(a.difficulty.toUpperCase())}>
                        {a.difficulty.toUpperCase()}
                      </span>
                      <span className={badge(`${a.questionCount} Qs`)}>
                        {a.questionCount} Qs
                      </span>
                      {a.timeLimitSec ? (
                        <span
                          className={badge(
                            `${Math.round(a.timeLimitSec / 60)} min`
                          )}
                        >
                          {Math.round(a.timeLimitSec / 60)} min
                        </span>
                      ) : null}
                      {a.maxAttempts != null ? (
                        <span
                          className={badge(
                            `Attempts: ${a.attemptsRemaining ?? 0} left`
                          )}
                        >
                          Attempts: {a.attemptsRemaining ?? 0} left
                        </span>
                      ) : (
                        <span className={badge("Attempts: ∞")}>
                          Attempts: ∞
                        </span>
                      )}
                    </div>

                    {/* ✅ show ALL topics as badges */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(a.topicSlugs?.length
                        ? a.topicSlugs
                        : (a.topics ?? []).map(topicSlug)
                      )
                        .filter(Boolean)
                        .map((slug, i) => (
                          <span key={`${slug}-${i}`} className={badge(slug.toUpperCase())}>
                            {slug.toUpperCase()}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => start(a)}
                      className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-extrabold hover:bg-emerald-300/15"
                    >
                      Start
                    </button>

                    <button
                      onClick={() =>
                        router.push(
                          `/practice/history?assignment=${encodeURIComponent(
                            a.id
                          )}`
                        )
                      }
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/70 hover:bg-white/10"
                    >
                      History
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
