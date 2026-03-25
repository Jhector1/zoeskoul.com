// src/app/progress/page.tsx
"use client";

import { difficultyOptions, topicOptions } from "@/components/vectorpad/types";
import { GenKey } from "@/lib/practice/types";
import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export type Topic =string;
type Difficulty = "easy" | "medium" | "hard";

type ProgressResponse = {
  totals: {
    sessionsCompleted: number;
    attempts: number;
    correct: number;
    accuracy: number; // 0..1
    bestTopic: Topic;
    streakDays: number;
  };
  byTopic: Array<{ topic: Topic; attempts: number; correct: number; accuracy: number }>;
  byDifficulty: Array<{ difficulty: Difficulty; attempts: number; correct: number; accuracy: number }>;
  accuracyTimeline: Array<{ date: string; attempts: number; correct: number; accuracy: number }>;
  recentSessions: Array<{
    id: string;
    createdAt: string;
    topic: Topic;
    difficulty: Difficulty;
    totalCount: number;
    correctCount: number;
    accuracy: number;
  }>;
  missed: Array<{
    occurredAt: string;
    topic: Topic;
    difficulty: Difficulty;
    kind: string;
    title: string;
    prompt: string;
    userAnswer: any;
    expected: any;
    explanation?: string;
  }>;
  meta: { range: string; topic: string; difficulty: string };
};

function cn(...cls: Array<string | false | undefined | null>) {
  return cls.filter(Boolean).join(" ");
}

function pct(x: number) {
  if (!Number.isFinite(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`Empty response body (status ${res.status})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (status ${res.status}): ${text.slice(0, 180)}`);
  }
}

const TOPIC_OPTIONS = topicOptions;

const DIFF_OPTIONS = difficultyOptions;

const RANGE_OPTIONS = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
];


export default function ProgressPage() {
  const [range, setRange] = useState("30d");
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");

  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [err, setErr] = useState<string>("");

  async function load() {
    setBusy(true);
    setErr("");
    try {
      const q = new URLSearchParams({
        range,
        topic,
        difficulty,
      });
      const r = await fetch(`/api/progress?${q.toString()}`, { cache: "no-store" });
      const j = (await readJsonSafe(r)) as ProgressResponse;
      if (!r.ok) throw new Error((j as any)?.message || `Request failed (${r.status})`);
      setData(j);
    } catch (e: any) {
      setErr(e?.message || "Failed to load progress.");
      setData(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, topic, difficulty]);

  const palette = useMemo(() => ["#7aa2ff", "#ff6bd6", "#53f7b6", "#ffdf6b", "#b59bff"], []);

const topicLabelById = useMemo(() => {
  const m = new Map<string, string>();
  TOPIC_OPTIONS.forEach(x => m.set(x.id, x.label));
  return m;
}, []);
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-white/90">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight">Progress</div>
            <div className="mt-1 text-sm text-white/70">
              Sessions, accuracy, missed questions, and performance by topic/difficulty.
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-extrabold text-white/90 outline-none"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              {RANGE_OPTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>

            <select
              className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-extrabold text-white/90 outline-none"
              value={topic}
              onChange={(e) => setTopic(e.target.value as any)}
            >
              {TOPIC_OPTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>

            <select
              className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-extrabold text-white/90 outline-none"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
            >
              {DIFF_OPTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {err ? (
          <div className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm text-white/85">
            <div className="font-extrabold">Couldn’t load progress</div>
            <div className="mt-1 text-white/70">{err}</div>
            <button
              onClick={load}
              className="mt-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold hover:bg-white/15"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* KPI Cards */}
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <KPI title="Attempts" value={data ? String(data.totals.attempts) : busy ? "…" : "—"} />
          <KPI title="Correct" value={data ? String(data.totals.correct) : busy ? "…" : "—"} />
          <KPI title="Accuracy" value={data ? pct(data.totals.accuracy) : busy ? "…" : "—"} />
          <KPI
            title="Sessions • Streak"
            value={data ? `${data.totals.sessionsCompleted} • ${data.totals.streakDays}d` : busy ? "…" : "—"}
sub={data ? `Best topic: ${topicLabelById.get(data.totals.bestTopic) ?? data.totals.bestTopic}` : ""}
          />
        </div>

        {/* Charts */}
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {/* Accuracy timeline */}
          <Card title="Accuracy over time" subtitle="Recent sessions trend">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.accuracyTimeline ?? []}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
                  <YAxis
                    stroke="rgba(255,255,255,0.45)"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    domain={[0, 1]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,12,18,0.92)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      color: "rgba(255,255,255,0.9)",
                      fontWeight: 700,
                    }}
                    formatter={(v: any, name: any) => (name === "accuracy" ? pct(Number(v)) : v)}
                  />
                  <Line type="monotone" dataKey="accuracy" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Attempts by topic */}
          <Card title="By topic" subtitle="Attempts / accuracy">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.byTopic ?? []}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="topic" stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.45)" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,12,18,0.92)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      color: "rgba(255,255,255,0.9)",
                      fontWeight: 700,
                    }}
                  />
                  <Bar dataKey="attempts" radius={[10, 10, 4, 4]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {(data?.byTopic ?? []).map((t) => (
                <div key={t.topic} className="rounded-xl border border-white/10 bg-black/20 p-2">
                  <div className="font-extrabold text-white/80">{t.topic.toUpperCase()}</div>
                  <div className="mt-1 text-white/60">
                    {t.correct}/{t.attempts} • {pct(t.accuracy)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Difficulty split */}
          <Card title="Difficulty split" subtitle="Attempts distribution">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.byDifficulty ?? []}
                    dataKey="attempts"
                    nameKey="difficulty"
                    innerRadius={52}
                    outerRadius={86}
                    paddingAngle={4}
                  >
                    {(data?.byDifficulty ?? []).map((_, i) => (
                      <Cell key={i} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "rgba(10,12,18,0.92)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 14,
                      color: "rgba(255,255,255,0.9)",
                      fontWeight: 700,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              {(data?.byDifficulty ?? []).map((d, i) => (
                <div key={d.difficulty} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />
                    <span className="font-extrabold text-white/80">{d.difficulty.toUpperCase()}</span>
                  </div>
                  <div className="text-white/60">
                    {d.correct}/{d.attempts} • {pct(d.accuracy)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Recent sessions + Missed */}
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <Card title="Recent sessions" subtitle="Your latest practice blocks">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-white/55">
                  <tr>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Topic</th>
                    <th className="py-2 pr-3">Difficulty</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-0 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="text-white/80">
                  {(data?.recentSessions ?? []).map((s) => (
                    <tr key={s.id} className="border-t border-white/10">
                      <td className="py-2 pr-3 text-white/70">{fmtDate(s.createdAt)}</td>
                      <td className="py-2 pr-3 font-extrabold">{s.topic}</td>
                      <td className="py-2 pr-3">{s.difficulty}</td>
                      <td className="py-2 pr-3">
                        <span className="font-extrabold">
                          {s.correctCount}/{s.totalCount}
                        </span>
                      </td>
                      <td className="py-2 pr-0 text-right font-extrabold">{pct(s.accuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* <Card title="Missed questions" subtitle="Review what you got wrong">
            {!data?.missed?.length ? (
              <div className="text-sm text-white/70">No missed questions in this range 🎉</div>
            ) : (
              <div className="grid gap-2">
                {data.missed.map((m, idx) => (
                  <div key={idx} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-extrabold text-white/70">
                        {m.topic.toUpperCase()} • {m.difficulty.toUpperCase()} • {m.kind}
                      </div>
                      <div className="text-[11px] text-white/55">{fmtDate(m.occurredAt)}</div>
                    </div>

                    <div className="mt-2 text-sm font-black text-white/90">{m.title}</div>
                    <div className="mt-1 text-xs text-white/70">{m.prompt}</div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
  <div className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-2">
    <div className="font-extrabold text-white/80">Your answer</div>
    <JsonBlock value={m.userAnswer} />
  </div>

  <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-2">
    <div className="font-extrabold text-white/80">Expected</div>
    <JsonBlock value={m.expected} />
  </div>
</div>


                    {m.explanation ? (
                      <div className="mt-2 text-xs text-white/65">
                        <span className="font-extrabold text-white/75">Why:</span> {m.explanation}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card> */}
        </div>
      </div>
    </div>
  );
}




function prettyJson(v: any) {
  if (v === undefined) return "—";
  if (typeof v === "string") return v; // keep strings readable
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// function JsonBlock({ value }: { value: any }) {
//   const text = prettyJson(value);
//   return (
//     <pre
//       className={cn(
//         "mt-1 rounded-lg border border-white/10 bg-black/30 p-2",
//         "font-mono text-[11px] leading-relaxed text-white/85",
//         "whitespace-pre-wrap break-words", // ✅ wraps nicely
//         "max-h-40 overflow-auto" // ✅ prevents huge cards
//       )}
//     >
//       {text}
//     </pre>
//   );
// }


function JsonBlock({ value, label = "View JSON" }: { value: any; label?: string }) {
  const text = prettyJson(value);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer select-none text-[11px] font-extrabold text-white/70 hover:text-white/85">
        {label}
      </summary>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-white/85">
        {text}
      </pre>
    </details>
  );
}






function KPI({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
      <div className="text-xs font-extrabold text-white/60">{title}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white/90">{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/55">{sub}</div> : null}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.30)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-black text-white/90">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/60">{subtitle}</div> : null}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
