import { prisma } from "@/lib/prisma";
import AssignmentEditor from "@/components/admin/assignments/AssignmentEditor";

export const dynamic = "force-dynamic";

function normalizeSection(s: any) {
  return {
    ...s,
    // section.topics is join rows -> flatten to PracticeTopic[]
    topics: (s.topics ?? [])
      .slice()
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((row: any) => row.topic),
  };
}

function normalizeAssignment(a: any) {
  if (!a) return null;

  return {
    ...a,
    // assignment.topics is join rows -> flatten to strings for form controls
    topicIds: (a.topics ?? [])
      .slice()
      .sort((x: any, y: any) => (x.order ?? 0) - (y.order ?? 0))
      .map((row: any) => row.topicId),

    // if your editor expects "topics" as PracticeTopic[] too:
    topics: (a.topics ?? [])
      .slice()
      .sort((x: any, y: any) => (x.order ?? 0) - (y.order ?? 0))
      .map((row: any) => row.topic),
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sectionsRaw = await prisma.practiceSection.findMany({
    orderBy: [{ order: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      topics: {
        orderBy: { order: "asc" },
        include: {
          topic: { select: { id: true, slug: true, titleKey: true, order: true } },
        },
      },
    },
  });

  const sections = sectionsRaw.map(normalizeSection);

  const assignmentRaw =
    id === "new"
      ? null
      : await prisma.assignment.findUnique({
          where: { id },
          include: {
            section: {
              select: {
                id: true,
                title: true,
                slug: true,
                topics: {
                  orderBy: { order: "asc" },
                  include: { topic: { select: { id: true, slug: true, titleKey: true, order: true } } },
                },
              },
            },
            topics: {
              orderBy: { order: "asc" },
              include: { topic: { select: { id: true, slug: true, titleKey: true, order: true } } },
            },
          },
        });

  const assignment = assignmentRaw
    ? {
        ...normalizeAssignment(assignmentRaw),
        section: normalizeSection(assignmentRaw.section),
      }
    : null;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <AssignmentEditor
        mode={id === "new" ? "new" : "edit"}
        initialAssignment={assignment as any}
        sections={sections as any}
      />
    </main>
  );
}
