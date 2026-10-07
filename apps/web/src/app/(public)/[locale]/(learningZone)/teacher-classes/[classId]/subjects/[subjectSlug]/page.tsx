import {
  notFound,
  redirect,
} from "next/navigation";

import {
  findFirstCompiledClassCourseModule,
  getTeacherClassCourseContext,
} from "@/lib/learningGroups/classCourseWorkspace";
import {
  requireTeachingPageUser,
} from "@/lib/teaching/requireTeachingPageUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{
    locale: string;
    classId: string;
    subjectSlug: string;
  }>;
}) {
  const {
    locale,
    classId,
    subjectSlug,
  } = await params;

  const callbackPath =
    `/teacher-classes/${encodeURIComponent(classId)}` +
    `/subjects/${encodeURIComponent(subjectSlug)}`;

  const teachingUser =
    await requireTeachingPageUser({
      locale,
      callbackPath,
    });

  const context =
    await getTeacherClassCourseContext({
      classId,
      subjectSlug,
      teachingUser,
    });

  if (!context) {
    notFound();
  }

  const moduleSlug =
    await findFirstCompiledClassCourseModule(
      subjectSlug,
    );

  if (!moduleSlug) {
    notFound();
  }

  redirect(
    `/${encodeURIComponent(locale)}` +
      `/teacher-classes/${encodeURIComponent(classId)}` +
      `/subjects/${encodeURIComponent(subjectSlug)}` +
      `/modules/${encodeURIComponent(moduleSlug)}/learn`,
  );
}
