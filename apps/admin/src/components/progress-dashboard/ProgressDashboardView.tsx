import type { CSSProperties } from "react";
import type {
    AtRiskLearnerSnapshot,
    DailyProgressPoint,
    LearnerProgressSnapshot,
    ProgressDashboardResponse,
    RecentXpEventSnapshot,
    SubjectProgressInsight,
} from "@zoeskoul/progress-contracts";
import { LearnerCourseReport } from "@/components/progress-dashboard/LearnerCourseReport";
import { buildLearnerDetailHref } from "@/lib/progress/shared";

type ProgressDashboardViewProps = {
    data: ProgressDashboardResponse;
};
const adminLinkStyle: CSSProperties = {
    display: "inline-flex",
    marginTop: 16,
    color: "var(--accent)",
    fontWeight: 800,
    textDecoration: "none",
};
const learnerLinkStyle: CSSProperties = {
    color: "var(--accent)",
    fontWeight: 800,
    textDecoration: "none",
};
export function ProgressDashboardView({ data }: ProgressDashboardViewProps) {
    return (
        <main style={{ padding: "40px 24px 64px" }}>
            <div style={{ maxWidth: 1320, margin: "0 auto" }}>
                <DashboardHero data={data} />
                <KpiGrid data={data} />
                <InsightGrid data={data} />
                <RiskAndEventsGrid data={data} />
                <LearnerCourseReport learners={data.learners} />
                <LearnerTable learners={data.learners} />
            </div>
        </main>
    );
}

function DashboardHero({ data }: { data: ProgressDashboardResponse }) {
    return (
        <section style={heroStyle}>
            <div style={heroInnerStyle}>
                <div style={{ maxWidth: 720 }}>
                    <div style={eyebrowStyle}>Admin Dashboard</div>

                    <h1 style={heroTitleStyle}>
                        Real learner tracking and progress insights
                    </h1>

                    <p style={heroTextStyle}>
                        Track XP, streaks, subject progress, review completion,
                        accuracy, certificates, and at-risk learners from the
                        same production database used by the web app.
                    </p>
                    <a href="/questions" style={adminLinkStyle}>
                        View question struggle report
                    </a>
                    <div style={metaRowStyle}>
                        <MetaPill label="Range" value={rangeLabel(data.meta.range)} />
                        <MetaPill
                            label="Generated"
                            value={formatDateTime(data.meta.generatedAt)}
                        />
                        <MetaPill
                            label="Showing"
                            value={`${data.learners.length} rows`}
                        />
                    </div>
                </div>

                <DashboardFilters data={data} />
            </div>
        </section>
    );
}

function DashboardFilters({ data }: { data: ProgressDashboardResponse }) {
    return (
        <form method="get" style={filterFormStyle}>
            <label style={fieldGroupStyle}>
                <span style={fieldLabelStyle}>Range</span>
                <select name="range" defaultValue={data.meta.range} style={fieldStyle}>
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
                    placeholder="Name, email, actor key"
                    style={fieldStyle}
                />
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
                Refresh dashboard
            </button>
        </form>
    );
}

function KpiGrid({ data }: { data: ProgressDashboardResponse }) {
    const overview = data.overview;

    return (
        <section style={kpiGridStyle}>
            <KpiCard
                label="Learners"
                value={formatNumber(overview.totalLearners)}
                detail={`${formatNumber(overview.activeLearners)} active · ${formatNumber(
                    overview.inactiveLearners,
                )} inactive`}
            />

            <KpiCard
                label="XP Earned"
                value={formatNumber(overview.totalXpInRange)}
                detail={`${formatNumber(overview.xpEventsInRange)} XP events`}
            />

            <KpiCard
                label="Attempts"
                value={formatNumber(overview.totalAttempts)}
                detail={`${formatNumber(overview.totalCorrect)} correct answers`}
            />

            <KpiCard
                label="Average Accuracy"
                value={formatPct(overview.averageAccuracy)}
                detail={`${formatNumber(
                    overview.totalSessionsCompleted,
                )} completed sessions`}
            />

            <KpiCard
                label="Study Time"
                value={formatMinutes(overview.totalMinutesStudied)}
                detail="From DailyLearningStat"
            />

            <KpiCard
                label="Enrollments"
                value={formatNumber(overview.totalEnrollments)}
                detail={`${formatNumber(
                    overview.totalCompletedEnrollments,
                )} completed`}
            />

            <KpiCard
                label="Certificates"
                value={formatNumber(overview.totalCertificates)}
                detail="Issued course certificates"
            />

            <KpiCard
                label="Range"
                value={rangeLabel(data.meta.range)}
                detail="Current dashboard window"
            />
        </section>
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

function InsightGrid({ data }: { data: ProgressDashboardResponse }) {
    return (
        <section style={twoColumnGridStyle}>
            <DailyTrendCard daily={data.insights.daily} />
            <TopSubjectsCard subjects={data.insights.topSubjects} />
        </section>
    );
}

function DailyTrendCard({ daily }: { daily: DailyProgressPoint[] }) {
    return (
        <Panel
            title="Daily trend"
            description="XP, attempts, sessions, study time, and active learners by day."
        >
            <div style={stackStyle}>
                {daily.length ? (
                    daily.map((point) => (
                        <div key={point.day} style={miniRowStyle}>
                            <div>
                                <div style={rowTitleStyle}>{point.day}</div>
                                <div style={rowSubtextStyle}>
                                    {formatNumber(point.activeLearners)} active learners ·{" "}
                                    {formatNumber(point.sessions)} sessions ·{" "}
                                    {formatMinutes(point.minutesStudied)}
                                </div>
                            </div>

                            <div style={rightTextStyle}>
                                <div style={rowStrongStyle}>
                                    {formatNumber(point.xpEarned)} XP
                                </div>
                                <div style={rowSubtextStyle}>
                                    {formatNumber(point.attempts)} attempts ·{" "}
                                    {formatNumber(point.correct)} correct
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <EmptyState message="No daily activity in this range." />
                )}
            </div>
        </Panel>
    );
}

function TopSubjectsCard({ subjects }: { subjects: SubjectProgressInsight[] }) {
    return (
        <Panel
            title="Top subjects"
            description="Subjects ranked by XP, enrollment, and learner activity."
        >
            <div style={stackStyle}>
                {subjects.length ? (
                    subjects.map((subject) => (
                        <div key={subject.subjectId} style={miniRowStyle}>
                            <div>
                                <div style={rowTitleStyle}>{subject.title}</div>
                                <div style={rowSubtextStyle}>
                                    {formatNumber(subject.enrolledLearners)} enrolled ·{" "}
                                    {formatNumber(subject.completedLearners)} completed
                                </div>
                            </div>

                            <div style={rightTextStyle}>
                                <div style={rowStrongStyle}>
                                    {formatNumber(subject.xpInRange)} XP
                                </div>
                                <div style={rowSubtextStyle}>
                                    {formatNumber(subject.activeLearners)} active
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <EmptyState message="No subject activity yet." />
                )}
            </div>
        </Panel>
    );
}

function RiskAndEventsGrid({ data }: { data: ProgressDashboardResponse }) {
    return (
        <section style={twoColumnGridStyle}>
            <AtRiskLearnersCard learners={data.insights.atRiskLearners} />
            <RecentXpEventsCard events={data.insights.recentXpEvents} />
        </section>
    );
}

function AtRiskLearnersCard({
                                learners,
                            }: {
    learners: AtRiskLearnerSnapshot[];
}) {
    return (
        <Panel
            title="At-risk learners"
            description="Learners with low accuracy or no recent activity."
        >
            <div style={stackStyle}>
                {learners.length ? (
                    learners.map((learner) => (
                        <div key={learner.actorKey} style={miniRowStyle}>
                            <div>
                                <div style={rowTitleStyle}>
                                    <a
                                        href={buildLearnerDetailHref(learner.actorKey)}
                                        style={learnerLinkStyle}
                                    >
                                        {learner.name || "Guest learner"}
                                    </a>
                                </div>
                                <div style={rowSubtextStyle}>
                                    {learner.email || learner.actorKey}
                                </div>
                                <div style={warningTextStyle}>{learner.reason}</div>
                            </div>

                            <div style={rightTextStyle}>
                                <div style={rowStrongStyle}>
                                    {formatPct(learner.accuracy)}
                                </div>
                                <div style={rowSubtextStyle}>
                                    {learner.inactiveDays === null
                                        ? "Never active"
                                        : `${learner.inactiveDays}d inactive`}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <EmptyState message="No at-risk learners in this range." />
                )}
            </div>
        </Panel>
    );
}

function RecentXpEventsCard({ events }: { events: RecentXpEventSnapshot[] }) {
    return (
        <Panel
            title="Recent XP events"
            description="Latest XP-worthy learning actions from the event ledger."
        >
            <div style={stackStyle}>
                {events.length ? (
                    events.slice(0, 10).map((event) => (
                        <div key={event.id} style={miniRowStyle}>
                            <div>
                                <div style={rowTitleStyle}>
                                    <a
                                        href={buildLearnerDetailHref(event.actorKey)}
                                        style={learnerLinkStyle}
                                    >
                                        {event.learnerName || "Guest learner"}
                                    </a>
                                </div>

                                <div style={rowSubtextStyle}>
                                    {event.reason} · {event.sourceType}
                                </div>

                                <div style={rowSubtextStyle}>
                                    {event.subjectTitle || "No subject"}
                                    {event.moduleTitle ? ` · ${event.moduleTitle}` : ""}
                                </div>
                            </div>

                            <div style={rightTextStyle}>
                                <div style={rowStrongStyle}>+{event.xpDelta} XP</div>
                                <div style={rowSubtextStyle}>
                                    {formatDate(event.createdAt)}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <EmptyState message="No XP events in this range." />
                )}
            </div>
        </Panel>
    );
}

function LearnerTable({ learners }: { learners: LearnerProgressSnapshot[] }) {
    return (
        <section style={tablePanelStyle}>
            <div style={tableHeaderStyle}>
                <div>
                    <h2 style={sectionTitleStyle}>Learner table</h2>
                    <p style={sectionDescriptionStyle}>
                        Real learner progress joined from users, XP, daily stats,
                        review progress, enrollments, and certificates.
                    </p>
                </div>
            </div>

            <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                    <thead>
                    <tr style={tableHeadRowStyle}>
                        {[
                            "Learner",
                            "Level",
                            "XP",
                            "Accuracy",
                            "Attempts",
                            "Sessions",
                            "Study Time",
                            "Streak",
                            "Review",
                            "Courses",
                            "Last Active",
                            "Actor Key",
                        ].map((header) => (
                            <th key={header} style={thStyle}>
                                {header}
                            </th>
                        ))}
                    </tr>
                    </thead>

                    <tbody>
                    {learners.length ? (
                        learners.map((learner, index) => (
                            <LearnerTableRow
                                key={learner.learnerId}
                                learner={learner}
                                index={index}
                            />
                        ))
                    ) : (
                        <tr>
                            <td colSpan={12} style={emptyTableCellStyle}>
                                No learners match this filter.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function LearnerTableRow({
                             learner,
                             index,
                         }: {
    learner: LearnerProgressSnapshot;
    index: number;
}) {
    return (
        <tr
            style={{
                background:
                    index % 2 === 0 ? "transparent" : "rgba(255,255,255,0.35)",
            }}
        >
            <td style={cellStyle}>
                <a
                    href={buildLearnerDetailHref(learner.actorKey)}
                    style={learnerLinkStyle}
                >
                    {learner.name || "Guest learner"}
                </a>
                <div style={mutedSmallStyle}>
                    {learner.email || learner.userId || "No linked account"}
                </div>
                <div style={{ ...mutedSmallStyle, marginTop: 6 }}>
                    Open learner detail
                </div>
            </td>

            <td style={cellStyle}>{learner.level}</td>

            <td style={cellStyle}>
                <div style={{ fontWeight: 800 }}>
                    {formatNumber(learner.totalXp)}
                </div>
                <div style={mutedSmallStyle}>
                    +{formatNumber(learner.xpInRange)} in range
                </div>
            </td>

            <td style={cellStyle}>
                <span
                    style={pillStyle(
                        learner.accuracy >= 0.75
                            ? "rgba(45, 126, 86, 0.12)"
                            : learner.accuracy >= 0.55
                                ? "rgba(191, 122, 38, 0.14)"
                                : "rgba(181, 70, 70, 0.12)",
                        learner.accuracy >= 0.75
                            ? "#2d7e56"
                            : learner.accuracy >= 0.55
                                ? "var(--warm)"
                                : "#b54646",
                    )}
                >
                    {formatPct(learner.accuracy)}
                </span>
            </td>

            <td style={cellStyle}>
                <div>{formatNumber(learner.attempts)}</div>
                <div style={mutedSmallStyle}>
                    {formatNumber(learner.correct)} correct
                </div>
            </td>

            <td style={cellStyle}>
                <div>{formatNumber(learner.sessionsCompleted)}</div>
                <div style={mutedSmallStyle}>
                    {formatNumber(learner.daysActive)} active days
                </div>
            </td>

            <td style={cellStyle}>
                <div>{formatMinutes(learner.minutesStudied)}</div>
                <div style={mutedSmallStyle}>Tracked study time</div>
            </td>

            <td style={cellStyle}>
                <span style={pillStyle("var(--accent-soft)", "var(--accent)")}>
                    {learner.currentStreak} day current
                </span>
                <div style={{ ...mutedSmallStyle, marginTop: 8 }}>
                    Best: {learner.longestStreak}
                </div>
            </td>

            <td style={cellStyle}>
                <div>
                    {learner.reviewModulesCompleted} /{" "}
                    {learner.reviewModulesTracked}
                </div>
                <div style={mutedSmallStyle}>modules completed</div>
            </td>

            <td style={cellStyle}>
                <div>
                    {learner.completedSubjects} / {learner.enrolledSubjects}
                </div>
                <div style={mutedSmallStyle}>
                    {learner.certificatesIssued} certificates
                </div>
            </td>

            <td style={cellStyle}>
                <div>{formatDate(learner.lastActiveOn)}</div>
                <div style={mutedSmallStyle}>
                    {learner.inactiveDays === null
                        ? "No activity yet"
                        : `${learner.inactiveDays}d inactive`}
                </div>
            </td>

            <td style={actorKeyCellStyle}>{learner.actorKey}</td>
        </tr>
    );
}

function Panel(props: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div style={panelStyle}>
            <h2 style={sectionTitleStyle}>{props.title}</h2>
            <p style={sectionDescriptionStyle}>{props.description}</p>
            {props.children}
        </div>
    );
}

function MetaPill(props: { label: string; value: string }) {
    return (
        <div style={metaPillStyle}>
            <span style={metaPillLabelStyle}>{props.label}</span>
            <span style={metaPillValueStyle}>{props.value}</span>
        </div>
    );
}

function EmptyState(props: { message: string }) {
    return <div style={emptyStateStyle}>{props.message}</div>;
}

function formatPct(value: number) {
    return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number) {
    return new Intl.NumberFormat("en-US").format(value);
}

function formatMinutes(value: number) {
    if (!Number.isFinite(value) || value <= 0) return "0m";

    if (value < 60) {
        return `${value}m`;
    }

    const hours = Math.floor(value / 60);
    const minutes = value % 60;

    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDate(value: string | null) {
    if (!value) return "Never";

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
}

function formatDateTime(value: string | null) {
    if (!value) return "Never";

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(value));
}

function rangeLabel(range: string) {
    if (range === "7d") return "Last 7 days";
    if (range === "90d") return "Last 90 days";
    return "Last 30 days";
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
    background: "rgba(255,252,246,0.65)",
    border: "1px solid var(--line)",
    borderRadius: 28,
    padding: 28,
    backdropFilter: "blur(10px)",
    boxShadow: "0 18px 60px rgba(28,26,23,0.07)",
};

const heroInnerStyle: CSSProperties = {
    display: "flex",
    gap: 24,
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
    fontSize: 14,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--warm)",
    fontWeight: 800,
};

const heroTitleStyle: CSSProperties = {
    margin: "10px 0 8px",
    fontSize: 52,
    lineHeight: 1,
    fontWeight: 800,
};

const heroTextStyle: CSSProperties = {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.5,
    color: "var(--muted)",
};

const metaRowStyle: CSSProperties = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 18,
};

const metaPillStyle: CSSProperties = {
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    border: "1px solid var(--line)",
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.6)",
};

const metaPillLabelStyle: CSSProperties = {
    color: "var(--muted)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800,
};

const metaPillValueStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
};

const filterFormStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    minWidth: "min(100%, 560px)",
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

const twoColumnGridStyle: CSSProperties = {
    display: "grid",
    gap: 16,
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    marginTop: 22,
};

const panelStyle: CSSProperties = {
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 24,
    padding: 22,
    boxShadow: "0 16px 40px rgba(28,26,23,0.06)",
};

const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: 26,
    fontWeight: 800,
};

const sectionDescriptionStyle: CSSProperties = {
    margin: "8px 0 0",
    color: "var(--muted)",
    fontSize: 15,
    lineHeight: 1.45,
};

const stackStyle: CSSProperties = {
    display: "grid",
    gap: 10,
    marginTop: 16,
};

const miniRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: 14,
    background: "rgba(255,255,255,0.45)",
};

const rowTitleStyle: CSSProperties = {
    fontWeight: 800,
};

const rowSubtextStyle: CSSProperties = {
    color: "var(--muted)",
    fontSize: 13,
    marginTop: 3,
};

const rowStrongStyle: CSSProperties = {
    fontWeight: 800,
};

const rightTextStyle: CSSProperties = {
    textAlign: "right",
    minWidth: 110,
};

const warningTextStyle: CSSProperties = {
    color: "var(--warm)",
    fontSize: 13,
    marginTop: 5,
    fontWeight: 700,
};

const emptyStateStyle: CSSProperties = {
    border: "1px dashed var(--line)",
    borderRadius: 16,
    padding: 18,
    color: "var(--muted)",
    background: "rgba(255,255,255,0.35)",
};

const tablePanelStyle: CSSProperties = {
    marginTop: 22,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 24,
    overflow: "hidden",
    boxShadow: "0 16px 40px rgba(28,26,23,0.06)",
};

const tableHeaderStyle: CSSProperties = {
    padding: "20px 22px",
    borderBottom: "1px solid var(--line)",
};

const tableStyle: CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 1320,
};

const tableHeadRowStyle: CSSProperties = {
    background: "rgba(28,26,23,0.04)",
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

const actorKeyCellStyle: CSSProperties = {
    ...cellStyle,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    maxWidth: 220,
    overflowWrap: "anywhere",
};

const mutedSmallStyle: CSSProperties = {
    color: "var(--muted)",
    fontSize: 14,
};

const emptyTableCellStyle: CSSProperties = {
    padding: 28,
    color: "var(--muted)",
    textAlign: "center",
    borderBottom: "1px solid var(--line)",
};
