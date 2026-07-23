import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";
import LearningGroupEditor from "@/components/admin/learning-groups/LearningGroupEditor";

export const dynamic = "force-dynamic";

export default async function LearningGroupPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const teachingUser = await requireTeachingPageUser({
    locale,
    callbackPath: `/admin/learning-groups/${id}`,
  });
  const group = id === "new" ? null : await prisma.learningGroup.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    include: { members: { include: { user: { select: { email: true } } } } },
  });
  if (id !== "new" && !group) notFound();
  return <main className="mx-auto max-w-3xl p-6"><LearningGroupEditor initialGroup={group as any} /></main>;
}
