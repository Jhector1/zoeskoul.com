import {
  renderClassCourseWorkspacePage,
} from "@/components/teaching/class-course-workspace/ClassCourseWorkspacePage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{
    locale: string;
    classId: string;
    subjectSlug: string;
    moduleSlug: string;
  }>;
}) {
  const {
    locale,
    classId,
    subjectSlug,
    moduleSlug,
  } = await params;

  return renderClassCourseWorkspacePage({
    locale,
    classId,
    subjectSlug,
    moduleSlug,
  });
}
