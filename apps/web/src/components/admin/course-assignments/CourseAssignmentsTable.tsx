import { Link } from "@/i18n/navigation";

export default function CourseAssignmentsTable({ assignments }: { assignments: any[] }) {
  if (!assignments.length) {
    return <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">No private course assignments yet.</div>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-600"><tr><th className="px-4 py-3">Assignment</th><th className="px-4 py-3">Course</th><th className="px-4 py-3">Audience</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Due</th><th /></tr></thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr key={assignment.id} className="border-t border-neutral-200">
              <td className="px-4 py-3"><div className="font-medium">{assignment.title}</div><div className="text-xs text-neutral-500">{assignment.slug}</div></td>
              <td className="px-4 py-3"><div>{assignment.subject.title}</div><div className="text-xs text-neutral-500">{assignment.subject.visibility}</div></td>
              <td className="px-4 py-3">{assignment._count.users} students · {assignment._count.groups} groups</td>
              <td className="px-4 py-3 capitalize">{assignment.status}</td>
              <td className="px-4 py-3">{assignment.dueAt ? new Date(assignment.dueAt).toLocaleString() : "—"}</td>
              <td className="px-4 py-3 text-right"><Link href={`/admin/course-assignments/${assignment.id}`} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium">Edit</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
