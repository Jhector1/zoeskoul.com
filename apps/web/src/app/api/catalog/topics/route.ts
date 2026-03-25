import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type TopicDto = {
  slug: string;
  titleKey: string;
  description?: string | null;
  order: number;
  genKey?: string | null;
  variant?: string | null;     // from meta.variant (recommended)
  meta?: any;
  label: string;               // derived: meta.label || titleKey || slug
  minutes?: number | null;     // derived: meta.minutes
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const subjectSlug = searchParams.get("subject") || undefined;
  const moduleSlug = searchParams.get("module") || undefined;
  const sectionSlug = searchParams.get("section") || undefined;

  // 1) SECTION filter (join table)
  if (sectionSlug) {
    const section = await prisma.practiceSection.findUnique({
      where: { slug: sectionSlug },
      include: {
        topics: {
          orderBy: { order: "asc" },
          include: {
            topic: {
              select: {
                slug: true,
                titleKey: true,
                description: true,
                order: true,
                genKey: true,
                meta: true,
              },
            },
          },
        },
      },
    });

    if (!section) return NextResponse.json({ topics: [] });

    const topics: TopicDto[] = section.topics.map(({ topic, order }) => {
      const meta: any = topic.meta ?? {};
      const label = String(meta?.label ?? topic.titleKey ?? topic.slug);
      const minutes = typeof meta?.minutes === "number" ? meta.minutes : null;
      const variant = typeof meta?.variant === "string" ? meta.variant : null;

      return {
        slug: topic.slug,
        titleKey: topic.titleKey,
        description: topic.description,
        // IMPORTANT: section link order should win inside a section
        order: typeof order === "number" ? order : topic.order,
        genKey: topic.genKey ?? null,
        meta: topic.meta ?? null,
        label,
        minutes,
        variant,
      };
    });

    return NextResponse.json({ topics });
  }

  // 2) Subject/module filter (topic table)
  const rows = await prisma.practiceTopic.findMany({
    where: {
      subject: subjectSlug ? { slug: subjectSlug } : undefined,
      module: moduleSlug ? { slug: moduleSlug } : undefined,
    },
    orderBy: [{ order: "asc" }, { slug: "asc" }],
    select: {
      slug: true,
      titleKey: true,
      description: true,
      order: true,
      genKey: true,
      meta: true,
    },
  });

  const topics: TopicDto[] = rows.map((t) => {
    const meta: any = t.meta ?? {};
    const label = String(meta?.label ?? t.titleKey ?? t.slug);
    const minutes = typeof meta?.minutes === "number" ? meta.minutes : null;
    const variant = typeof meta?.variant === "string" ? meta.variant : null;

    return {
      slug: t.slug,
      titleKey: t.titleKey,
      description: t.description,
      order: t.order,
      genKey: t.genKey ?? null,
      meta: t.meta ?? null,
      label,
      minutes,
      variant,
    };
  });

  return NextResponse.json({ topics });
}
