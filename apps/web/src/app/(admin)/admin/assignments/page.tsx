import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AssignmentsTable from "@/components/admin/assignments/AssignmentsTable";

export const dynamic = "force-dynamic";

export default async function Page() {
  const assignments = await prisma.assignment.findMany({
    orderBy: [{ updatedAt: "desc" }],
    include: {
      section: { select: { id: true, title: true, slug: true } },
      _count: { select: { sessions: true } },
    },
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assignments</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Create, publish, and manage practice assignments.
          </p>
        </div>

        <Link
          href="/admin/assignments/new"
          className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New
        </Link>
      </div>

      <div className="mt-6">
        <AssignmentsTable assignments={assignments as any} />
      </div>
    </main>
  );
}
