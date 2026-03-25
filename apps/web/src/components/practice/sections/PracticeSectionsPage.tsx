// src/app/practice/sections/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { topicOptions } from "@/components/vectorpad/types";
import type { Topic } from "@/lib/practice/types";

type PracticeTopic = Topic | "all";
type PracticeDifficulty = "easy" | "medium" | "hard";

type Section = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  order: number;
  topics: Exclude<PracticeTopic, "all">[];
  meta?: {
    module?: number; // used to group on this page
    weeks?: string;
    bullets?: string[];
    skills?: string[];
  } | null;
};

const DIFFS: { id: PracticeDifficulty; label: string; hint: string }[] = [
  { id: "easy", label: "Easy", hint: "Warm up" },
  { id: "medium", label: "Medium", hint: "Solid practice" },
  { id: "hard", label: "Hard", hint: "Mastery" },
];

const TOPICS = topicOptions;

// pick a default that matches your seed slug
const DEFAULT_SUBJECT = "linear-algebra";

export default function PracticeSectionsPage() {
  const sp = useSearchParams();

  // ✅ subject comes from URL (?subject=python) with a stable fallback
  const subject = (sp.get("subject") ?? DEFAULT_SUBJECT).trim() || DEFAULT_SUBJECT;

  const [sections, setSections] = useState<Section[]>([]);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>("easy");
  const [topic, setTopic] = useState<PracticeTopic>("all");
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBusy(true);
      setErr(null);

      try {
        const r = await fetch(
          `/api/practice/sections?subject=${encodeURIComponent(subject)}`,
          {
            cache: "no-store",
            headers: { Accept: "application/json" },
          }
        );

        const contentType = r.headers.get("content-type") || "";
        const raw = await r.text(); // read once

        if (!r.ok) {
          throw new Error(
            `Failed ${r.status} ${r.statusText}: ${raw.slice(0, 200)}`
          );
        }

        if (!raw.trim()) {
          if (!cancelled) setSections([]);
          return;
        }

        if (!contentType.includes("application/json")) {
          throw new Error(
            `Expected JSON but got "${contentType}". Body: ${raw.slice(0, 200)}`
          );
        }

        const data = JSON.parse(raw);
        if (!cancelled) setSections((data.sections ?? []) as Section[]);
      } catch (e: any) {
        if (!cancelled) {
          setSections([]);
          setErr(e?.message ?? "Failed to load sections.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subject]);

  // optional: build a set of all topics that exist across sections (to disable impossible filters)
  const allSectionTopics = useMemo(() => {
    const set = new Set<Exclude<PracticeTopic, "all">>();
    for (const s of sections) for (const t of s.topics) set.add(t);
    return set;
  }, [sections]);

  // ✅ group by module (meta.module) and build module-level "What you'll learn"
  const modules = useMemo(() => {
    const map = new Map<number, Section[]>();

    for (const s of sections) {
      const m = s.meta?.module ?? 0;
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(s);
    }

    // sort each module's sections
    for (const [m, arr] of map) {
      arr.sort((a, b) => a.order - b.order);
      map.set(m, arr);
    }

    // return sorted modules list
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([moduleNumber, secs]) => {
        const bullets = Array.from(
          new Set(secs.flatMap((s) => s.meta?.bullets ?? []))
        );
        const skills = Array.from(
          new Set(secs.flatMap((s) => s.meta?.skills ?? []))
        );
        const weeks = secs.find((s) => s.meta?.weeks)?.meta?.weeks;

        return {
          moduleNumber,
          weeks,
          bullets,
          skills,
          sections: secs,
        };
      });
  }, [sections]);

  const topicPills = (topics: Section["topics"]) => (
    <div className="flex flex-wrap gap-2">
      {topics.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTopic(t)}
          className={[
            "rounded-full border px-2 py-1 text-[11px] font-extrabold transition",
            topic === t
              ? "border-emerald-300/30 bg-emerald-300/10 text-white"
              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
          ].join(" ")}
          title="Click to set topic filter"
        >
          {String(t).toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-6 bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-white/90">
      <div className="mx-auto max-w-5xl">
        {/* header */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-lg font-black tracking-tight">
                  Practice{" "}
                  <span className="ml-2 text-xs font-extrabold text-white/50">
                    • subject: {subject}
                  </span>
                </div>
                <div className="mt-1 text-sm text-white/70">
                  Pick a module, then a section, difficulty, and topic.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {DIFFS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id)}
                    className={[
                      "rounded-xl border px-3 py-2 text-xs font-extrabold transition",
                      difficulty === d.id
                        ? "border-emerald-300/30 bg-emerald-300/10 text-white"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                    ].join(" ")}
                  >
                    {d.label}{" "}
                    <span className="ml-1 text-white/50">• {d.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* topic picker */}
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => {
                const disabled =
                  t.id !== "all" &&
                  sections.length > 0 &&
                  !allSectionTopics.has(t.id as Exclude<PracticeTopic, "all">);

                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setTopic(t.id as PracticeTopic)}
                    className={[
                      "rounded-xl border px-3 py-2 text-xs font-extrabold transition",
                      topic === t.id
                        ? "border-sky-300/30 bg-sky-300/10 text-white"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                      disabled
                        ? "opacity-40 cursor-not-allowed hover:bg-white/5"
                        : "",
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* list */}
        <div className="mt-4 grid gap-3">
          {busy ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white/70">
              Loading sections…
            </div>
          ) : err ? (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-red-50">
              <div className="text-sm font-black">Failed to load</div>
              <div className="mt-1 text-xs text-red-100/80">{err}</div>
            </div>
          ) : sections.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white/70">
              No sections found for subject <code>{subject}</code>. (Run seed, or verify DB
              connection.)
            </div>
          ) : (
            modules.map((m) => {
              const moduleId = `module-${m.moduleNumber}`;

              return (
                <div
                  key={moduleId}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5"
                >
                  {/* Module header */}
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="text-lg font-black tracking-tight">
                        Module {m.moduleNumber}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        {m.weeks ?? "Practice sections grouped by module."}
                      </div>
                    </div>

                    {/* Module review keeps subject in URL */}
                    <Link
                      className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold hover:bg-white/15"
                      href={`/practice/review/${encodeURIComponent(
                        moduleId
                      )}?subject=${encodeURIComponent(subject)}`}
                    >
                      Open module review
                    </Link>
                  </div>

                  {/* Module-level "What you'll learn" */}
                  {m.bullets.length || m.skills.length ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-extrabold text-white/70 hover:text-white/90">
                        What you’ll learn
                      </summary>

                      <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3">
                        {m.bullets.length ? (
                          <ul className="list-disc pl-4 text-xs text-white/70 space-y-1">
                            {m.bullets.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        ) : null}

                        {m.skills.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {m.skills.map((k, i) => (
                              <span
                                key={i}
                                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-extrabold text-white/70"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ) : null}

                  {/* Sections inside module */}
                  <div className="mt-4 grid gap-3">
                    {m.sections.map((s) => {
                      // Ensure we never pass an invalid topic for that section
                      const topicForSection: PracticeTopic =
                        topic === "all" || s.topics.includes(topic as any)
                          ? topic
                          : "all";

                      return (
                        <div
                          key={s.id}
                          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-black text-white/90">
                                {s.title}
                              </div>
                              {s.description ? (
                                <div className="mt-1 text-sm text-white/70">
                                  {s.description}
                                </div>
                              ) : null}
                              <div className="mt-3">{topicPills(s.topics)}</div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {/* ✅ Start includes subject */}
                              <Link
                                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold hover:bg-white/15"
                                href={`/practice?subject=${encodeURIComponent(
                                  subject
                                )}&section=${encodeURIComponent(
                                  s.slug
                                )}&difficulty=${difficulty}&topic=${encodeURIComponent(
                                  String(topicForSection)
                                )}`}
                              >
                                Start
                              </Link>

                              {/* ✅ History includes subject (optional, but nice) */}
                              <Link
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-extrabold text-white/70 hover:bg-white/10"
                                href={`/practice/history?subject=${encodeURIComponent(
                                  subject
                                )}&section=${encodeURIComponent(s.slug)}`}
                              >
                                View history
                              </Link>
                            </div>
                          </div>

                          {/* Optional section details */}
                          {s.meta?.weeks || s.meta?.bullets?.length ? (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-extrabold text-white/60 hover:text-white/90">
                                Section details{" "}
                                {s.meta?.weeks ? `• ${s.meta.weeks}` : ""}
                              </summary>

                              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3">
                                {s.meta?.bullets?.length ? (
                                  <ul className="list-disc pl-4 text-xs text-white/70 space-y-1">
                                    {s.meta.bullets.map((b, i) => (
                                      <li key={i}>{b}</li>
                                    ))}
                                  </ul>
                                ) : null}

                                {s.meta?.skills?.length ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {s.meta.skills.map((k, i) => (
                                      <span
                                        key={i}
                                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-extrabold text-white/70"
                                      >
                                        {k}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 text-xs text-white/50">
          Tip: “Start” passes <code>subject</code>, <code>section</code>,{" "}
          <code>difficulty</code>, and <code>topic</code>. “Open module review”
          goes to <code>/practice/review/module-X</code>.
        </div>
      </div>
    </div>
  );
}
