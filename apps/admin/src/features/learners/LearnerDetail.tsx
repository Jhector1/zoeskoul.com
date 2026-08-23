import type {
  LearnerProgressDetailResponse,
} from "@zoeskoul/progress-contracts";
import type { FormEvent } from "react";

import {
  AdminLink,
  navigateAdmin,
} from "@/app/navigation";
import {
  Badge,
  EmptyState,
  PageHeader,
  PageState,
  Panel,
  StatCard,
} from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPct,
  truncate,
} from "@/lib/format";
import { formSearchParams } from "@/lib/forms";
import { useAdminResource } from "@/lib/useAdminResource";

export function LearnerDetail(props: {
  apiOrigin: string;
  actorKey: string;
  search: string;
}) {
  const path =
    `/api/admin/learners/${encodeURIComponent(props.actorKey)}` +
    (props.search || "");

  const resource = useAdminResource<LearnerProgressDetailResponse>(
    props.apiOrigin,
    path,
  );

  if (resource.kind === "loading") {
    return (
      <PageState
        kind="loading"
        title="Loading learner"
      />
    );
  }

  if (resource.kind === "error") {
    return (
      <PageState
        kind="error"
        title="Learner unavailable"
        message={resource.message}
        action={
          <AdminLink className="button button-secondary" href="/">
            Back to overview
          </AdminLink>
        }
      />
    );
  }

  const detail = resource.data;
  const learner = detail.learner;

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = formSearchParams(event.currentTarget);
    const query = params.toString();
    const base = `/learners/${encodeURIComponent(props.actorKey)}`;
    navigateAdmin(query ? `${base}?${query}` : base);
  }

  return (
    <div className="page-stack">
      <AdminLink className="back-link" href="/">
        ← Back to overview
      </AdminLink>

      <PageHeader
        eyebrow="Learner"
        title={learner.name || "Guest learner"}
        description={
          learner.email ||
          learner.userId ||
          learner.actorKey
        }
        actions={
          <form className="inline-filters" onSubmit={submitFilters}>
            <select name="range" defaultValue={detail.meta.range}>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
            </select>
            <select name="limit" defaultValue={String(detail.meta.limit)}>
              <option value="15">15 history</option>
              <option value="30">30 history</option>
              <option value="50">50 history</option>
              <option value="100">100 history</option>
            </select>
            <button className="button button-secondary" type="submit">
              Apply
            </button>
          </form>
        }
      />

      <section className="stats-grid">
        <StatCard
          label="Level"
          value={String(learner.level)}
          detail={`${formatNumber(learner.totalXp)} total XP`}
        />
        <StatCard
          label="Accuracy"
          value={formatPct(detail.summary.accuracy)}
          detail={`${detail.summary.correct} correct · ${detail.summary.wrong} wrong`}
        />
        <StatCard
          label="Attempts"
          value={formatNumber(detail.summary.attempts)}
          detail={`${learner.sessionsCompleted} sessions`}
        />
        <StatCard
          label="Streak"
          value={`${learner.currentStreak}d`}
          detail={`Best ${learner.longestStreak}d`}
        />
      </section>

      <section className="overview-strip">
        <div>
          <span>Review modules</span>
          <strong>
            {learner.reviewModulesCompleted} / {learner.reviewModulesTracked}
          </strong>
        </div>
        <div>
          <span>Active days</span>
          <strong>{learner.daysActive}</strong>
        </div>
        <div>
          <span>Last active</span>
          <strong>{formatDate(learner.lastActiveOn)}</strong>
        </div>
        <div>
          <span>Actor key</span>
          <strong className="mono-text">{learner.actorKey}</strong>
        </div>
      </section>

      <Panel
        title="Course progress"
        description="Current position and completion for each enrolled subject."
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Current module</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Modules</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {learner.courseReports.length ? (
                learner.courseReports.map((course) => (
                  <tr key={`${learner.actorKey}:${course.subjectId}`}>
                    <td>
                      <strong>{course.subjectTitle}</strong>
                      <span>{course.subjectSlug}</span>
                    </td>
                    <td>
                      <strong>{course.currentModuleTitle || "Not started"}</strong>
                      <span>
                        {course.currentModuleOrder === null
                          ? "No module yet"
                          : `Module ${course.currentModuleOrder}`}
                      </span>
                    </td>
                    <td>
                      <div className="progress-cell">
                        <strong>{course.progressPct}%</strong>
                        <span className="progress-track">
                          <span
                            className="progress-fill"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, course.progressPct),
                              )}%`,
                            }}
                          />
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge
                        tone={
                          course.status === "completed"
                            ? "good"
                            : course.status === "in_progress"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {course.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td>
                      {course.completedModules} / {course.totalModules}
                    </td>
                    <td>{formatDate(course.lastSeenAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-empty" colSpan={6}>
                    No course progress is available for this learner.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="two-column-grid learner-detail-grid">
        <Panel
          title="Weak topics"
          description="Topics with the lowest success signals."
        >
          <div className="list-stack">
            {detail.weakTopics.length ? (
              detail.weakTopics.map((topic) => (
                <div className="list-row" key={topic.topicSlug}>
                  <div>
                    <strong>{topic.topicTitle || topic.topicSlug}</strong>
                    <span>
                      {topic.subjectTitle || "No subject"}
                      {topic.moduleTitle ? ` · ${topic.moduleTitle}` : ""}
                    </span>
                    <small>
                      Last attempt {formatDateTime(topic.lastAttemptAt)}
                    </small>
                  </div>
                  <div className="row-end">
                    <Badge
                      tone={
                        topic.successRate >= 0.75
                          ? "good"
                          : topic.successRate >= 0.55
                            ? "warn"
                            : "danger"
                      }
                    >
                      {formatPct(topic.successRate)}
                    </Badge>
                    <span>
                      {topic.attempts} attempts · {topic.wrong} wrong
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>No weak-topic signals in this range.</EmptyState>
            )}
          </div>
        </Panel>

        <Panel
          title="Recent question history"
          description={detail.historyNotice || undefined}
        >
          {!detail.canLoadAttemptHistory ? (
            <EmptyState>
              {detail.historyNotice || "Attempt history is unavailable."}
            </EmptyState>
          ) : detail.history.length ? (
            <div className="history-list">
              {detail.history.map((item) => (
                <article className="history-item" key={item.attemptId}>
                  <div className="history-title-row">
                    <strong>{item.title}</strong>
                    <Badge tone={item.ok ? "good" : "danger"}>
                      {item.ok ? "Correct" : "Missed"}
                    </Badge>
                  </div>
                  <p>{truncate(item.prompt, 150)}</p>
                  <span>
                    {item.subjectTitle || "No subject"}
                    {item.moduleTitle ? ` · ${item.moduleTitle}` : ""}
                    {" · "}
                    {formatDateTime(item.occurredAt)}
                    {item.revealUsed ? " · reveal used" : ""}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState>No attempts found in this range.</EmptyState>
          )}
        </Panel>
      </section>
    </div>
  );
}
