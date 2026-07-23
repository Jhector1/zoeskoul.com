import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";

export const dynamic = "force-dynamic";

export default async function LearningGroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const teachingUser = await requireTeachingPageUser({
    locale,
    callbackPath: "/admin/learning-groups",
  });
  const groups = await prisma.learningGroup.findMany({
    where: ownedTeachingRecordWhere(teachingUser),
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { members: true, assignments: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div><div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Teaching</div><h1 className="mt-1 text-2xl font-semibold">Student groups</h1><p className="mt-1 text-sm text-neutral-500">Maintain audience membership once and reuse it across private course assignments.</p></div>
        <div className="flex gap-2"><Link href="/admin/course-assignments" className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium">Course assignments</Link><Link href="/admin/learning-groups/new" className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">New group</Link></div>
      </div>
      <div className="mt-6 grid gap-3">
        {groups.length ? groups.map((group) => (
          <Link key={group.id} href={`/admin/learning-groups/${group.id}`} className="rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400">
            <div className="flex items-center justify-between"><div><div className="font-medium">{group.name}</div><div className="mt-1 text-xs text-neutral-500">{group.slug}</div></div><div className="text-sm text-neutral-600">{group._count.members} students · {group._count.assignments} assignments</div></div>
          </Link>
        )) : <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">No groups yet.</div>}
      </div>
    </main>
  );
}
