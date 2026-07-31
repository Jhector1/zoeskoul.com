import Link from "next/link";

function StatusBadge({ status }: { status: string }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "published")
    return <span className={`${base} bg-green-50 text-green-700`}>published</span>;
  if (status === "archived")
    return <span className={`${base} bg-neutral-100 text-neutral-700`}>archived</span>;
  return <span className={`${base} bg-yellow-50 text-yellow-700`}>draft</span>;
}

export default function AssignmentsTable({
  assignments,
}: {
  assignments: Array<any>;
}) {
  if (!assignments?.length) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        No assignments yet. Click <span className="font-medium">New</span> to create one.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-600">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Section</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Difficulty</th>
            <th className="px-4 py-3 font-medium">Questions</th>
            <th className="px-4 py-3 font-medium">Sessions</th>
            <th className="px-4 py-3 font-medium">Updated</th>
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id} className="border-t border-neutral-200">
              <td className="px-4 py-3">
                <div className="font-medium text-neutral-900">{a.title}</div>
                <div className="text-xs text-neutral-500">{a.slug}</div>
              </td>
              <td className="px-4 py-3">
                <div className="text-neutral-900">{a.section?.title ?? "—"}</div>
                <div className="text-xs text-neutral-500">{a.section?.slug ?? ""}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={a.status} />
              </td>
              <td className="px-4 py-3">{a.difficulty}</td>
              <td className="px-4 py-3">{a.questionCount}</td>
              <td className="px-4 py-3">{a._count?.sessions ?? 0}</td>
              <td className="px-4 py-3 text-neutral-600">
                {a.updatedAt ? new Date(a.updatedAt).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/assignments/${a.id}`}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
