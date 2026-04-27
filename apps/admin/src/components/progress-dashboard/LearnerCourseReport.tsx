import type { CSSProperties } from "react";
import type {
    LearnerCourseProgressReport,
    LearnerProgressSnapshot,
} from "@zoeskoul/progress-contracts";

export function LearnerCourseReport(props: {
    learners: LearnerProgressSnapshot[];
}) {
    const rows = props.learners.flatMap((learner) =>
        learner.courseReports.map((course) => ({
            learner,
            course,
        })),
    );

    return (
        <section style={panelStyle}>
            <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--line)" }}>
                <h2 style={{ margin: 0, fontSize: 28 }}>
                    Learner course report
                </h2>
                <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 15 }}>
                    See each learner&apos;s current module, completed modules,
                    course status, and certificate state.
                </p>
            </div>

            <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                    <thead>
                    <tr style={{ background: "rgba(28,26,23,0.04)" }}>
                        {[
                            "Learner",
                            "Course",
                            "Current Module",
                            "Progress",
                            "Status",
                            "Finished",
                            "Remaining",
                            "Last Seen",
                            "Certificate",
                        ].map((header) => (
                            <th key={header} style={thStyle}>
                                {header}
                            </th>
                        ))}
                    </tr>
                    </thead>

                    <tbody>
                    {rows.length ? (
                        rows.map(({ learner, course }) => (
                            <CourseReportRow
                                key={`${learner.actorKey}:${course.subjectId}`}
                                learner={learner}
                                course={course}
                            />
                        ))
                    ) : (
                        <tr>
                            <td colSpan={9} style={emptyCellStyle}>
                                No course progress found for the selected learners.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function CourseReportRow(props: {
    learner: LearnerProgressSnapshot;
    course: LearnerCourseProgressReport;
}) {
    const { learner, course } = props;

    return (
        <tr>
            <td style={cellStyle}>
                <div style={{ fontWeight: 800 }}>
                    {learner.name || "Guest learner"}
                </div>
                <div style={mutedStyle}>
                    {learner.email || learner.userId || learner.actorKey}
                </div>
            </td>

            <td style={cellStyle}>
                <div style={{ fontWeight: 800 }}>{course.subjectTitle}</div>
                <div style={mutedStyle}>{course.subjectSlug}</div>
            </td>

            <td style={cellStyle}>
                <div style={{ fontWeight: 800 }}>
                    {course.currentModuleTitle || "No module yet"}
                </div>
                <div style={mutedStyle}>
                    {course.currentModuleOrder === null
                        ? "Not started"
                        : `Module ${course.currentModuleOrder}`}
                </div>
            </td>

            <td style={cellStyle}>
                <div style={{ fontWeight: 800 }}>{course.progressPct}%</div>
                <div style={progressTrackStyle}>
                    <div
                        style={{
                            ...progressFillStyle,
                            width: `${Math.max(0, Math.min(100, course.progressPct))}%`,
                        }}
                    />
                </div>
            </td>

            <td style={cellStyle}>
                <span style={statusPillStyle(course.status)}>
                    {formatStatus(course.status)}
                </span>
            </td>

            <td style={cellStyle}>
                {course.completedModules} / {course.totalModules}
            </td>

            <td style={cellStyle}>{course.remainingModules}</td>

            <td style={cellStyle}>{formatDate(course.lastSeenAt)}</td>

            <td style={cellStyle}>
                {course.certificateIssued ? (
                    <span style={statusPillStyle("certified")}>Issued</span>
                ) : (
                    <span style={statusPillStyle("not_started")}>Not issued</span>
                )}
            </td>
        </tr>
    );
}

function formatStatus(status: string) {
    if (status === "not_started") return "Not started";
    if (status === "in_progress") return "In progress";
    if (status === "completed") return "Completed";
    if (status === "certified") return "Certified";
    return status;
}

function formatDate(value: string | null) {
    if (!value) return "Never";

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
}

function statusPillStyle(status: string): CSSProperties {
    const styles: Record<string, CSSProperties> = {
        not_started: {
            background: "rgba(28,26,23,0.06)",
            color: "var(--muted)",
        },
        in_progress: {
            background: "var(--accent-soft)",
            color: "var(--accent)",
        },
        completed: {
            background: "rgba(45,126,86,0.12)",
            color: "#2d7e56",
        },
        certified: {
            background: "rgba(191,122,38,0.14)",
            color: "var(--warm)",
        },
    };

    return {
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 13,
        fontWeight: 800,
        whiteSpace: "nowrap",
        ...(styles[status] ?? styles.not_started),
    };
}

const panelStyle: CSSProperties = {
    marginTop: 22,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 24,
    overflow: "hidden",
    boxShadow: "0 16px 40px rgba(28,26,23,0.06)",
};

const tableStyle: CSSProperties = {
    width: "100%",
    minWidth: 1180,
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

const emptyCellStyle: CSSProperties = {
    padding: 28,
    color: "var(--muted)",
    textAlign: "center",
};

const progressTrackStyle: CSSProperties = {
    marginTop: 8,
    width: 120,
    height: 8,
    borderRadius: 999,
    background: "rgba(28,26,23,0.08)",
    overflow: "hidden",
};

const progressFillStyle: CSSProperties = {
    height: "100%",
    borderRadius: 999,
    background: "var(--accent)",
};