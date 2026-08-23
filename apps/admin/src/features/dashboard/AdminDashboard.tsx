import type {
  AtRiskLearnerSnapshot,
  ProgressDashboardResponse,
} from "@zoeskoul/progress-contracts";
import type { FormEvent } from "react";

import { learnerHref } from "@/app/adminRoutes";
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
  formatMinutes,
  formatNumber,
  formatPct,
} from "@/lib/format";
import { formSearchParams } from "@/lib/forms";
import { withSearch } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";

export function AdminDashboard(props: {
  apiOrigin: string;
  search: string;
}) {
  const resource = useAdminResource<ProgressDashboardResponse>(
    props.apiOrigin,
    withSearch("/api/admin/progress", props.search),
  );

  if (resource.kind === "loading") {
    return (
      <PageState
        kind="loading"
        title="Loading overview"
        message="Reading current learner activity."
      />
    );
  }

  if (resource.kind === "error") {
    return (
      <PageState
        kind="error"
        title="Overview unavailable"
        message={resource.message}
        action={
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        }
      />
    );
  }

  const data = resource.data;
  const overview = data.overview;

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = formSearchParams(event.currentTarget);
    const query = params.toString();
    navigateAdmin(query ? `/?${query}` : "/");
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Overview"
        title="Platform health"
        description="A compact view of learner activity, progress, and signals that need attention."
        actions={
          <span className="header-meta">
            Updated {formatDateTime(data.meta.generatedAt)}
          </span>
        }
      />

      <form className="filter-bar" onSubmit={submitFilters}>
        <label>
          <span>Range</span>
          <select name="range" defaultValue={data.meta.range}>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        </label>

        <label className="filter-search">
          <span>Search learners</span>
          <input
            name="search"
            defaultValue={data.meta.search}
            placeholder="Name, email, actor key"
          />
        </label>

        <label>
          <span>Rows</span>
          <select name="limit" defaultValue={String(data.meta.limit)}>
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>

        <button className="button button-secondary" type="submit">
          Apply
        </button>
      </form>

      <section className="stats-grid">
        <StatCard
          label="Learners"
          value={formatNumber(overview.totalLearners)}
          detail={`${formatNumber(overview.activeLearners)} active`}
        />
        <StatCard
          label="Accuracy"
          value={formatPct(overview.averageAccuracy)}
          detail={`${formatNumber(overview.totalAttempts)} attempts`}
        />
        <StatCard
          label="XP earned"
          value={formatNumber(overview.totalXpInRange)}
          detail={`${formatNumber(overview.xpEventsInRange)} XP events`}
        />
        <StatCard
          label="Study time"
          value={formatMinutes(overview.totalMinutesStudied)}
          detail={`${formatNumber(overview.totalSessionsCompleted)} sessions`}
        />
      </section>

      <section className="overview-strip">
        <div>
          <span>Enrollments completed</span>
          <strong>
            {formatNumber(overview.totalCompletedEnrollments)}
            {" / "}
            {formatNumber(overview.totalEnrollments)}
          </strong>
        </div>
        <div>
          <span>Correct answers</span>
          <strong>{formatNumber(overview.totalCorrect)}</strong>
        </div>
        <div>
          <span>Inactive learners</span>
          <strong>{formatNumber(overview.inactiveLearners)}</strong>
        </div>
        <div>
          <span>Certificates</span>
          <strong>{formatNumber(overview.totalCertificates)}</strong>
        </div>
      </section>

      <section className="two-column-grid">
        <Panel
          title="Needs attention"
          description="Learners with low accuracy or recent inactivity."
        >
          <div className="list-stack">
            {data.insights.atRiskLearners.length ? (
              data.insights.atRiskLearners.slice(0, 6).map((learner) => (
                <RiskRow key={learner.actorKey} learner={learner} />
              ))
            ) : (
              <EmptyState>No at-risk learners in this range.</EmptyState>
            )}
          </div>
        </Panel>

        <Panel
          title="Top subjects"
          description="Subjects with the most activity in the selected range."
        >
          <div className="list-stack">
            {data.insights.topSubjects.length ? (
              data.insights.topSubjects.slice(0, 6).map((subject) => (
                <div className="list-row" key={subject.subjectId}>
                  <div>
                    <strong>{subject.title}</strong>
                    <span>
                      {formatNumber(subject.activeLearners)} active ·{" "}
                      {formatNumber(subject.enrolledLearners)} enrolled
                    </span>
                  </div>
                  <div className="row-end">
                    <strong>{formatNumber(subject.xpInRange)} XP</strong>
                    <span>
                      {formatNumber(subject.completedLearners)} completed
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>No subject activity yet.</EmptyState>
            )}
          </div>
        </Panel>
      </section>

      <section className="two-column-grid">
        <Panel
          title="Last 7 activity days"
          description="A short operational trend instead of a large dashboard chart."
        >
          <div className="list-stack">
            {data.insights.daily.length ? (
              data.insights.daily.slice(-7).map((point) => (
                <div className="list-row" key={point.day}>
                  <div>
                    <strong>{point.day}</strong>
                    <span>
                      {formatNumber(point.activeLearners)} active ·{" "}
                      {formatNumber(point.sessions)} sessions
                    </span>
                  </div>
                  <div className="row-end">
                    <strong>{formatNumber(point.xpEarned)} XP</strong>
                    <span>
                      {formatNumber(point.attempts)} attempts ·{" "}
                      {formatPct(
                        point.attempts
                          ? point.correct / point.attempts
                          : 0,
                      )}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>No daily activity in this range.</EmptyState>
            )}
          </div>
        </Panel>

        <Panel
          title="Recent XP"
          description="Latest learning actions from the XP ledger."
        >
          <div className="list-stack">
            {data.insights.recentXpEvents.length ? (
              data.insights.recentXpEvents.slice(0, 8).map((event) => (
                <div className="list-row" key={event.id}>
                  <div>
                    <AdminLink
                      className="inline-link"
                      href={learnerHref(event.actorKey)}
                    >
                      {event.learnerName || "Guest learner"}
                    </AdminLink>
                    <span>
                      {event.reason} · {event.subjectTitle || "No subject"}
                    </span>
                  </div>
                  <div className="row-end">
                    <strong>+{event.xpDelta} XP</strong>
                    <span>{formatDate(event.createdAt)}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>No recent XP events.</EmptyState>
            )}
          </div>
        </Panel>
      </section>

      <Panel
        title="Learners"
        description={`${data.learners.length} learner rows match the current filters.`}
        actions={
          <AdminLink className="inline-link" href="/questions">
            Question analytics
          </AdminLink>
        }
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Progress</th>
                <th>Accuracy</th>
                <th>XP</th>
                <th>Streak</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.learners.length ? (
                data.learners.map((learner) => (
                  <tr key={learner.actorKey}>
                    <td>
                      <strong>{learner.name || "Guest learner"}</strong>
                      <span>
                        {learner.email || learner.userId || learner.actorKey}
                      </span>
                    </td>
                    <td>
                      {learner.completedSubjects} / {learner.enrolledSubjects}
                      <span>{learner.sessionsCompleted} sessions</span>
                    </td>
                    <td>
                      <Badge
                        tone={
                          learner.accuracy >= 0.75
                            ? "good"
                            : learner.accuracy >= 0.55
                              ? "warn"
                              : "danger"
                        }
                      >
                        {formatPct(learner.accuracy)}
                      </Badge>
                      <span>{formatNumber(learner.attempts)} attempts</span>
                    </td>
                    <td>
                      <strong>{formatNumber(learner.xpInRange)}</strong>
                      <span>{formatNumber(learner.totalXp)} total</span>
                    </td>
                    <td>
                      {learner.currentStreak}d
                      <span>Best {learner.longestStreak}d</span>
                    </td>
                    <td>{formatDate(learner.lastActiveOn)}</td>
                    <td className="cell-action">
                      <AdminLink
                        className="table-link"
                        href={learnerHref(learner.actorKey)}
                      >
                        Open
                      </AdminLink>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-empty" colSpan={7}>
                    No learners match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function RiskRow(props: {
  learner: AtRiskLearnerSnapshot;
}) {
  const { learner } = props;
  return (
    <div className="list-row">
      <div>
        <AdminLink
          className="inline-link"
          href={learnerHref(learner.actorKey)}
        >
          {learner.name || "Guest learner"}
        </AdminLink>
        <span>{learner.email || learner.actorKey}</span>
        <small className="danger-copy">{learner.reason}</small>
      </div>
      <div className="row-end">
        <Badge tone={learner.accuracy >= 0.55 ? "warn" : "danger"}>
          {formatPct(learner.accuracy)}
        </Badge>
        <span>
          {learner.inactiveDays === null
            ? "Never active"
            : `${learner.inactiveDays}d inactive`}
        </span>
      </div>
    </div>
  );
}
