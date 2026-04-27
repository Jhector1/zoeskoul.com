import type { CSSProperties } from "react";
import type {
    QuestionAnalyticsResponse,
    StrugglingQuestionSnapshot,
} from "@zoeskoul/progress-contracts";

export function QuestionStruggleReport(props: {
    data: QuestionAnalyticsResponse;
}) {
    const { data } = props;

    return (
        <main style={{ padding: "40px 24px 64px" }}>
            <div style={{ maxWidth: 1320, margin: "0 auto" }}>
                <section style={heroStyle}>
                    <div>
                        <div style={eyebrowStyle}>Question Analytics</div>
                        <h1 style={titleStyle}>Where learners are getting stuck</h1>
                        <p style={textStyle}>
                            Review wrong attempts, repeat attempts, reveal usage,
                            success rate, and stuck score by question.
                        </p>
                        <a href="/" style={navLinkStyle}>
                            Back to learner dashboard
                        </a>
                    </div>

                    <form method="get" style={filterFormStyle}>
                        <label style={fieldGroupStyle}>
                            <span style={fieldLabelStyle}>Range</span>
                            <select
                                name="range"
                                defaultValue={data.meta.range}
                                style={fieldStyle}
                            >
                                <option value="7d">Last 7 days</option>
                                <option value="30d">Last 30 days</option>
                                <option value="90d">Last 90 days</option>
                            </select>
                        </label>

                        <label style={fieldGroupStyle}>
                            <span style={fieldLabelStyle}>Search</span>
                            <input
                                name="search"
                                defaultValue={data.meta.search}
                                placeholder="Question, topic, module, course"
                                style={fieldStyle}
                            />
                        </label>

                        <label style={fieldGroupStyle}>
                            <span style={fieldLabelStyle}>Min Attempts</span>
                            <select
                                name="minAttempts"
                                defaultValue={String(data.meta.minAttempts)}
                                style={fieldStyle}
                            >
                                <option value="1">1+</option>
                                <option value="3">3+</option>
                                <option value="5">5+</option>
                                <option value="10">10+</option>
                            </select>
                        </label>

                        <label style={fieldGroupStyle}>
                            <span style={fieldLabelStyle}>Rows</span>
                            <select
                                name="limit"
                                defaultValue={String(data.meta.limit)}
                                style={fieldStyle}
                            >
                                <option value="10">10</option>
                                <option value="25">25</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </label>

                        <button type="submit" style={submitButtonStyle}>
                            Refresh report
                        </button>
                    </form>
                </section>

                <section style={kpiGridStyle}>
                    <KpiCard
                        label="Questions"
                        value={formatNumber(data.overview.totalQuestions)}
                        detail="Questions with attempts in range"
                    />
                    <KpiCard
                        label="Attempts"
                        value={formatNumber(data.overview.totalAttempts)}
                        detail={`${formatNumber(
                            data.overview.totalWrongAttempts,
                        )} wrong attempts`}
                    />
                    <KpiCard
                        label="Success Rate"
                        value={formatPct(data.overview.averageSuccessRate)}
                        detail="Correct attempts divided by total attempts"
                    />
                    <KpiCard
                        label="Needs Review"
                        value={formatNumber(data.overview.questionsNeedingReview)}
                        detail="Low success, repeats, or reveal usage"
                    />
                </section>

                <QuestionTable questions={data.questions} />
            </div>
        </main>
    );
}

function QuestionTable(props: { questions: StrugglingQuestionSnapshot[] }) {
    return (
        <section style={panelStyle}>
            <div style={panelHeaderStyle}>
                <h2 style={{ margin: 0, fontSize: 28 }}>Stuck questions</h2>
                <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
                    Sorted by stuck score, then wrong attempts, then total attempts.
                </p>
            </div>

            <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                    <thead>
                    <tr style={{ background: "rgba(28,26,23,0.04)" }}>
                        {[
                            "Question",
                            "Course / Module",
                            "Kind",
                            "Attempts",
                            "Wrong",
                            "Reveal",
                            "Learners",
                            "Avg / Learner",
                            "Success",
                            "Stuck Score",
                            "Last Attempt",
                        ].map((header) => (
                            <th key={header} style={thStyle}>
                                {header}
                            </th>
                        ))}
                    </tr>
                    </thead>

                    <tbody>
                    {props.questions.length ? (
                        props.questions.map((question) => (
                            <QuestionRow
                                key={question.questionKey}
                                question={question}
                            />
                        ))
                    ) : (
                        <tr>
                            <td colSpan={11} style={emptyCellStyle}>
                                No question attempts match this filter.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function QuestionRow(props: { question: StrugglingQuestionSnapshot }) {
    const { question } = props;

    return (
        <tr>
            <td style={cellStyle}>
                <div style={{ fontWeight: 800 }}>{question.title}</div>
                <div style={mutedStyle}>{truncate(question.prompt, 140)}</div>
                <div style={monoStyle}>{question.questionKey}</div>
            </td>

            <td style={cellStyle}>
                <div style={{ fontWeight: 800 }}>
                    {question.subjectTitle || "No course"}
                </div>
                <div style={mutedStyle}>
                    {question.moduleTitle || "No module"}
                </div>
                <div style={mutedStyle}>{question.topicSlug || "No topic"}</div>
            </td>

            <td style={cellStyle}>
                <span style={pillStyle("rgba(28,26,23,0.06)", "var(--ink)")}>
                    {question.kind}
                </span>
                <div style={{ ...mutedStyle, marginTop: 8 }}>
                    {question.difficulty}
                </div>
            </td>

            <td style={cellStyle}>{formatNumber(question.attempts)}</td>

            <td style={cellStyle}>
                <span style={pillStyle("rgba(181,70,70,0.12)", "#b54646")}>
                    {formatNumber(question.wrongAttempts)}
                </span>
            </td>

            <td style={cellStyle}>{formatNumber(question.revealUsed)}</td>

            <td style={cellStyle}>{formatNumber(question.uniqueLearners)}</td>

            <td style={cellStyle}>
                {question.avgAttemptsPerLearner.toFixed(1)}
            </td>

            <td style={cellStyle}>
                <span
                    style={pillStyle(
                        question.successRate >= 0.75
                            ? "rgba(45,126,86,0.12)"
                            : question.successRate >= 0.55
                                ? "rgba(191,122,38,0.14)"
                                : "rgba(181,70,70,0.12)",
                        question.successRate >= 0.75
                            ? "#2d7e56"
                            : question.successRate >= 0.55
                                ? "var(--warm)"
                                : "#b54646",
                    )}
                >
                    {formatPct(question.successRate)}
                </span>
            </td>

            <td style={cellStyle}>
                <strong>{formatNumber(question.stuckScore)}</strong>
            </td>

            <td style={cellStyle}>{formatDate(question.lastAttemptAt)}</td>
        </tr>
    );
}

function KpiCard(props: { label: string; value: string; detail?: string }) {
    return (
        <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>{props.label}</div>
            <div style={kpiValueStyle}>{props.value}</div>
            {props.detail ? <div style={kpiDetailStyle}>{props.detail}</div> : null}
        </div>
    );
}

function truncate(value: string, max: number) {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(value);
}

function formatPct(value: number) {
    return `${Math.round(value * 100)}%`;
}

function formatDate(value: string | null) {
    if (!value) return "Never";

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
}

function pillStyle(background: string, color: string): CSSProperties {
    return {
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "6px 10px",
        background,
        color,
        fontSize: 13,
        fontWeight: 800,
        whiteSpace: "nowrap",
    };
}

const heroStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 24,
    flexWrap: "wrap",
    background: "rgba(255,252,246,0.65)",
    border: "1px solid var(--line)",
    borderRadius: 28,
    padding: 28,
    backdropFilter: "blur(10px)",
    boxShadow: "0 18px 60px rgba(28,26,23,0.07)",
};

const eyebrowStyle: CSSProperties = {
    fontSize: 14,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--warm)",
    fontWeight: 800,
};

const titleStyle: CSSProperties = {
    margin: "10px 0 8px",
    fontSize: 48,
    lineHeight: 1,
    fontWeight: 800,
};

const textStyle: CSSProperties = {
    margin: 0,
    maxWidth: 720,
    fontSize: 18,
    lineHeight: 1.5,
    color: "var(--muted)",
};

const filterFormStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    minWidth: "min(100%, 520px)",
};

const fieldGroupStyle: CSSProperties = {
    display: "grid",
    gap: 6,
};

const fieldLabelStyle: CSSProperties = {
    fontSize: 13,
    color: "var(--muted)",
    fontWeight: 800,
};

const fieldStyle: CSSProperties = {
    width: "100%",
    padding: "13px 14px",
    borderRadius: 14,
    border: "1px solid var(--line)",
    background: "rgba(255,255,255,0.82)",
    color: "var(--ink)",
};

const submitButtonStyle: CSSProperties = {
    gridColumn: "1 / -1",
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    background: "var(--accent)",
    color: "white",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
};

const navLinkStyle: CSSProperties = {
    display: "inline-flex",
    marginTop: 16,
    color: "var(--accent)",
    fontWeight: 800,
    textDecoration: "none",
};

const kpiGridStyle: CSSProperties = {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    marginTop: 22,
};

const kpiCardStyle: CSSProperties = {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 20,
    padding: 20,
    boxShadow: "0 16px 40px rgba(28,26,23,0.06)",
};

const kpiLabelStyle: CSSProperties = {
    fontSize: 13,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800,
};

const kpiValueStyle: CSSProperties = {
    fontSize: 34,
    fontWeight: 800,
    marginTop: 8,
};

const kpiDetailStyle: CSSProperties = {
    marginTop: 8,
    color: "var(--muted)",
    fontSize: 14,
};

const panelStyle: CSSProperties = {
    marginTop: 22,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 24,
    overflow: "hidden",
    boxShadow: "0 16px 40px rgba(28,26,23,0.06)",
};

const panelHeaderStyle: CSSProperties = {
    padding: "20px 22px",
    borderBottom: "1px solid var(--line)",
};

const tableStyle: CSSProperties = {
    width: "100%",
    minWidth: 1380,
    borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
    textAlign: "left",
    padding: "14px 18px",
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
    borderBottom: "1px solid var(--line)",
};

const cellStyle: CSSProperties = {
    padding: "16px 18px",
    borderBottom: "1px solid var(--line)",
    verticalAlign: "top",
};

const mutedStyle: CSSProperties = {
    marginTop: 4,
    color: "var(--muted)",
    fontSize: 13,
};

const monoStyle: CSSProperties = {
    marginTop: 8,
    color: "var(--muted)",
    fontSize: 12,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    overflowWrap: "anywhere",
};

const emptyCellStyle: CSSProperties = {
    padding: 28,
    color: "var(--muted)",
    textAlign: "center",
};
