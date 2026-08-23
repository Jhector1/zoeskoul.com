import type {
  QuestionAnalyticsResponse,
} from "@zoeskoul/progress-contracts";
import type { FormEvent } from "react";

import { navigateAdmin } from "@/app/navigation";
import {
  Badge,
  PageHeader,
  PageState,
  Panel,
  StatCard,
} from "@/components/ui";
import {
  formatDate,
  formatNumber,
  formatPct,
  truncate,
} from "@/lib/format";
import { formSearchParams } from "@/lib/forms";
import { withSearch } from "@/lib/adminApi";
import { useAdminResource } from "@/lib/useAdminResource";

export function QuestionAnalytics(props: {
  apiOrigin: string;
  search: string;
}) {
  const resource = useAdminResource<QuestionAnalyticsResponse>(
    props.apiOrigin,
    withSearch("/api/admin/questions", props.search),
  );

  if (resource.kind === "loading") {
    return (
      <PageState
        kind="loading"
        title="Loading question analytics"
      />
    );
  }

  if (resource.kind === "error") {
    return (
      <PageState
        kind="error"
        title="Question analytics unavailable"
        message={resource.message}
      />
    );
  }

  const data = resource.data;

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = formSearchParams(event.currentTarget);
    const query = params.toString();
    navigateAdmin(query ? `/questions?${query}` : "/questions");
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Questions"
        title="Where learners get stuck"
        description="Wrong attempts, repeats, reveal usage, success rate, and stuck score."
      />

      <form className="filter-bar filter-bar-wide" onSubmit={submitFilters}>
        <label>
          <span>Range</span>
          <select name="range" defaultValue={data.meta.range}>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        </label>

        <label className="filter-search">
          <span>Search</span>
          <input
            name="search"
            defaultValue={data.meta.search}
            placeholder="Question, topic, module, course"
          />
        </label>

        <label>
          <span>Min attempts</span>
          <select
            name="minAttempts"
            defaultValue={String(data.meta.minAttempts)}
          >
            <option value="1">1+</option>
            <option value="3">3+</option>
            <option value="5">5+</option>
            <option value="10">10+</option>
          </select>
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
          label="Questions"
          value={formatNumber(data.overview.totalQuestions)}
        />
        <StatCard
          label="Attempts"
          value={formatNumber(data.overview.totalAttempts)}
          detail={`${formatNumber(data.overview.totalWrongAttempts)} wrong`}
        />
        <StatCard
          label="Success"
          value={formatPct(data.overview.averageSuccessRate)}
        />
        <StatCard
          label="Needs review"
          value={formatNumber(data.overview.questionsNeedingReview)}
        />
      </section>

      <Panel
        title="Stuck questions"
        description="Highest stuck score first. The table keeps only operationally useful columns."
      >
        <div className="table-wrap">
          <table className="data-table question-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Context</th>
                <th>Attempts</th>
                <th>Success</th>
                <th>Stuck</th>
                <th>Last attempt</th>
              </tr>
            </thead>
            <tbody>
              {data.questions.length ? (
                data.questions.map((question) => (
                  <tr key={question.questionKey}>
                    <td className="question-cell">
                      <strong>{question.title}</strong>
                      <span>{truncate(question.prompt)}</span>
                      <small>{question.kind} · {question.difficulty}</small>
                    </td>
                    <td>
                      <strong>{question.subjectTitle || "No course"}</strong>
                      <span>
                        {question.moduleTitle || "No module"}
                        {question.topicSlug
                          ? ` · ${question.topicSlug}`
                          : ""}
                      </span>
                    </td>
                    <td>
                      <strong>{formatNumber(question.attempts)}</strong>
                      <span>
                        {formatNumber(question.wrongAttempts)} wrong ·{" "}
                        {formatNumber(question.revealUsed)} reveals
                      </span>
                      <span>
                        {formatNumber(question.uniqueLearners)} learners ·{" "}
                        {question.avgAttemptsPerLearner.toFixed(1)} avg
                      </span>
                    </td>
                    <td>
                      <Badge
                        tone={
                          question.successRate >= 0.75
                            ? "good"
                            : question.successRate >= 0.55
                              ? "warn"
                              : "danger"
                        }
                      >
                        {formatPct(question.successRate)}
                      </Badge>
                    </td>
                    <td>
                      <strong>{formatNumber(question.stuckScore)}</strong>
                    </td>
                    <td>{formatDate(question.lastAttemptAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="table-empty" colSpan={6}>
                    No question attempts match this filter.
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
