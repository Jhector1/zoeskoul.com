import type { CSSProperties, ReactNode } from "react";
import { notFound } from "next/navigation";
import {
    getLearnerProgressDetail,
    searchParamsToLearnerProgressDetailQuery,
} from "@/lib/progress/query";
import { LearnerCourseReport } from "@/components/progress-dashboard/LearnerCourseReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ actorKey: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatPct(value: number) {
    return `${Math.round(value * 100)}%`;
}

function formatDateTime(value: string | null) {
    if (!value) return "Never";
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function Section(props: {
    title: string;
    description?: string;
    children: ReactNode;
}) {
    return (
        <section
            style={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderRadius: 24,
                padding: 22,
                boxShadow: "0 16px 40px rgba(28,26,23,0.06)",
            }}
        >
            <h2 style={{ margin: 0, fontSize: 28 }}>{props.title}</h2>
            {props.description ? (
                <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
                    {props.description}
                </p>
            ) : null}
            <div style={{ marginTop: 18 }}>{props.children}</div>
        </section>
    );
}

function Kpi(props: { label: string; value: string; detail?: string }) {
    return (
        <div
            style={{
                background: "rgba(255,255,255,0.55)",
                border: "1px solid var(--line)",
                borderRadius: 18,
                padding: 18,
            }}
        >
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
                {props.label}
            </div>
            <div style={{ marginTop: 8, fontSize: 30, fontWeight: 800 }}>
                {props.value}
            </div>
            {props.detail ? (
                <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 14 }}>
                    {props.detail}
                </div>
            ) : null}
        </div>
    );
}

export default async function LearnerDetailPage(props: PageProps) {
    const params = await props.params;
    const rawSearchParams = (await props.searchParams) ?? {};
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(rawSearchParams)) {
        if (Array.isArray(value)) {
            for (const item of value) searchParams.append(key, item);
        } else if (typeof value === "string") {
            searchParams.set(key, value);
        }
    }

    const query = searchParamsToLearnerProgressDetailQuery(searchParams);
    const detail = await getLearnerProgressDetail({
        actorKey: decodeURIComponent(params.actorKey),
        query,
    });

    if (!detail) notFound();

    const learner = detail.learner;

    return (
        <main style={{ padding: "40px 24px 64px" }}>
            <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 22 }}>
                <section
                    style={{
                        background: "rgba(255,252,246,0.65)",
                        border: "1px solid var(--line)",
                        borderRadius: 28,
                        padding: 28,
                        backdropFilter: "blur(10px)",
                        boxShadow: "0 18px 60px rgba(28,26,23,0.07)",
                    }}
                >
                    <a href="/" style={{ color: "var(--accent)", fontWeight: 800, textDecoration: "none" }}>
                        Back to admin dashboard
                    </a>
                    <div style={{ marginTop: 14, display: "flex", gap: 24, justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div>
                            <div style={{ fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--warm)", fontWeight: 700 }}>
                                Learner Detail
                            </div>
                            <h1 style={{ margin: "10px 0 8px", fontSize: 48, lineHeight: 1, fontWeight: 800 }}>
                                {learner.name || "Guest learner"}
                            </h1>
                            <p style={{ margin: 0, color: "var(--muted)", fontSize: 18 }}>
                                {learner.email || learner.userId || "No linked account"} · {learner.actorKey}
                            </p>
                        </div>

                        <form method="get" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, minWidth: "min(100%, 360px)" }}>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>Range</span>
                                <select name="range" defaultValue={detail.meta.range} style={fieldStyle}>
                                    <option value="7d">Last 7 days</option>
                                    <option value="30d">Last 30 days</option>
                                    <option value="90d">Last 90 days</option>
                                </select>
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700 }}>History rows</span>
                                <select name="limit" defaultValue={String(detail.meta.limit)} style={fieldStyle}>
                                    <option value="15">15</option>
                                    <option value="30">30</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                </select>
                            </label>
                            <button type="submit" style={buttonStyle}>
                                Refresh learner detail
                            </button>
                        </form>
                    </div>
                </section>

                <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <Kpi label="Level" value={String(learner.level)} detail={`${learner.totalXp} total XP`} />
                    <Kpi label="Accuracy" value={formatPct(detail.summary.accuracy)} detail={`${detail.summary.correct} correct · ${detail.summary.wrong} wrong`} />
                    <Kpi label="Attempts" value={String(detail.summary.attempts)} detail={`${learner.sessionsCompleted} completed sessions`} />
                    <Kpi label="Streak" value={`${learner.currentStreak} days`} detail={`Best streak ${learner.longestStreak}`} />
                    <Kpi label="Review" value={`${learner.reviewModulesCompleted}/${learner.reviewModulesTracked}`} detail="Tracked modules completed" />
                    <Kpi label="Last Active" value={formatDateTime(learner.lastActiveOn)} detail={`${learner.daysActive} active days in range`} />
                </section>

                <LearnerCourseReport learners={[learner]} />

                <div style={{ display: "grid", gap: 22, gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.75fr)" }}>
                    <Section
                        title="Question history"
                        description="Recent answered questions for this learner in the selected range."
                    >
                        {!detail.canLoadAttemptHistory ? (
                            <div style={emptyStateStyle}>{detail.historyNotice}</div>
                        ) : detail.history.length ? (
                            <div style={{ display: "grid", gap: 12 }}>
                                {detail.history.map((item) => (
                                    <article
                                        key={item.attemptId}
                                        style={{
                                            border: "1px solid var(--line)",
                                            borderRadius: 18,
                                            padding: 16,
                                            background: "rgba(255,255,255,0.55)",
                                        }}
                                    >
                                        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
                                            <div>
                                                <div style={{ fontWeight: 800 }}>{item.title}</div>
                                                <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 14 }}>
                                                    {item.subjectTitle || "No subject"}
                                                    {item.moduleTitle ? ` · ${item.moduleTitle}` : ""}
                                                    {item.topicSlug ? ` · ${item.topicSlug}` : ""}
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    borderRadius: 999,
                                                    padding: "6px 10px",
                                                    fontSize: 13,
                                                    fontWeight: 800,
                                                    background: item.ok
                                                        ? "rgba(45, 126, 86, 0.12)"
                                                        : "rgba(181, 70, 70, 0.12)",
                                                    color: item.ok ? "#2d7e56" : "#b54646",
                                                }}
                                            >
                                                {item.ok ? "Correct" : "Missed"}
                                            </div>
                                        </div>
                                        <p style={{ margin: "12px 0 0", lineHeight: 1.5 }}>
                                            {item.prompt}
                                        </p>
                                        <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 14 }}>
                                            {item.kind} · {item.difficulty} · {formatDateTime(item.occurredAt)}
                                            {item.revealUsed ? " · reveal used" : ""}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div style={emptyStateStyle}>No attempts found in this range.</div>
                        )}
                    </Section>

                    <Section
                        title="Weak topics"
                        description="Topics with the lowest success rate and the most misses."
                    >
                        {detail.weakTopics.length ? (
                            <div style={{ display: "grid", gap: 12 }}>
                                {detail.weakTopics.map((topic) => (
                                    <div
                                        key={topic.topicSlug}
                                        style={{
                                            border: "1px solid var(--line)",
                                            borderRadius: 18,
                                            padding: 16,
                                            background: "rgba(255,255,255,0.55)",
                                        }}
                                    >
                                        <div style={{ fontWeight: 800 }}>
                                            {topic.topicTitle || topic.topicSlug}
                                        </div>
                                        <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 14 }}>
                                            {topic.subjectTitle || "No subject"}
                                            {topic.moduleTitle ? ` · ${topic.moduleTitle}` : ""}
                                        </div>
                                        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            <span style={statPillStyle}>{formatPct(topic.successRate)} success</span>
                                            <span style={statPillStyle}>{topic.attempts} attempts</span>
                                            <span style={statPillStyle}>{topic.wrong} wrong</span>
                                        </div>
                                        <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 14 }}>
                                            Last attempt: {formatDateTime(topic.lastAttemptAt)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={emptyStateStyle}>
                                No weak-topic signals yet for this learner in the selected range.
                            </div>
                        )}
                    </Section>
                </div>
            </div>
        </main>
    );
}

const fieldStyle: CSSProperties = {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 14,
    border: "1px solid var(--line)",
    background: "rgba(255,255,255,0.82)",
    color: "var(--ink)",
};

const buttonStyle: CSSProperties = {
    gridColumn: "1 / -1",
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    background: "var(--accent)",
    color: "white",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
};

const emptyStateStyle: CSSProperties = {
    border: "1px dashed var(--line)",
    borderRadius: 18,
    padding: 18,
    color: "var(--muted)",
    background: "rgba(255,255,255,0.45)",
    lineHeight: 1.5,
};

const statPillStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 700,
};
