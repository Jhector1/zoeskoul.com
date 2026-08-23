import { Link } from "@/i18n/navigation";
import type { TutoringLearnerDashboardRow } from "@/lib/tutoring/sessionProgressSummary";

function learnerLabel(row: TutoringLearnerDashboardRow) {
  return row.name || row.email || "Learner";
}

export default function TutoringLearnerDashboard({
  sessionId,
  rows,
}: {
  sessionId: string;
  rows: TutoringLearnerDashboardRow[];
}) {
  return (
    <section className="rounded-2xl border bg-white p-6">
      <div>
        <h2 className="font-semibold">Learner work</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Review individual quizzes, exercises, projects, and code changes without exposing one learner&apos;s work to another.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">Learner</th>
              <th className="px-3 py-2">Topics</th>
              <th className="px-3 py-2">Quizzes</th>
              <th className="px-3 py-2">Exercises</th>
              <th className="px-3 py-2">Projects</th>
              <th className="px-3 py-2">Code changes</th>
              <th className="px-3 py-2">Last activity</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0">
                <td className="px-3 py-3">
                  <div className="font-medium">{learnerLabel(row)}</div>
                  {row.name && row.email ? (
                    <div className="text-xs text-neutral-500">{row.email}</div>
                  ) : null}
                </td>
                <td className="px-3 py-3">{row.completedTopics}</td>
                <td className="px-3 py-3">
                  {row.quizCorrect}/{row.quizAnswered}
                </td>
                <td className="px-3 py-3">{row.exercisesCompleted}</td>
                <td className="px-3 py-3">{row.projectsCompleted}</td>
                <td className="px-3 py-3">
                  {row.changedFiles} changed · {row.addedFiles} added
                </td>
                <td className="px-3 py-3 text-neutral-500">
                  {row.lastActivity ? new Date(row.lastActivity).toLocaleString() : "Not started"}
                </td>
                <td className="px-3 py-3 text-right">
                  <Link
                    href={`/tutoring-sessions/${sessionId}?workspace=learner&learnerId=${encodeURIComponent(row.id)}`}
                    className="rounded-lg border px-3 py-2 text-xs font-medium"
                  >
                    Open workspace
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                  No learners are assigned yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
