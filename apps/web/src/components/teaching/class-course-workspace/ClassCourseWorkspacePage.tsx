import { notFound } from "next/navigation";

import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { loadReviewModulePageData } from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/loadReviewModulePageData";
import ClassCourseWorkspaceBar from "@/components/teaching/class-course-workspace/ClassCourseWorkspaceBar";
import {
  getTeacherClassCourseContext,
} from "@/lib/learningGroups/classCourseWorkspace";
import {
  resolveTeacherAppHref,
} from "@/lib/navigation/teacherAppHref";
import {
  requireTeachingPageUser,
} from "@/lib/teaching/requireTeachingPageUser";

export async function renderClassCourseWorkspacePage(args: {
  locale: string;
  classId: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const routePrefix =
    `/${encodeURIComponent(args.locale)}` +
    `/teacher-classes/${encodeURIComponent(args.classId)}`;

  const callbackPath =
    `/teacher-classes/${encodeURIComponent(args.classId)}` +
    `/subjects/${encodeURIComponent(args.subjectSlug)}` +
    `/modules/${encodeURIComponent(args.moduleSlug)}/learn`;

  const teachingUser =
    await requireTeachingPageUser({
      locale: args.locale,
      callbackPath,
    });

  const context =
    await getTeacherClassCourseContext({
      classId: args.classId,
      subjectSlug: args.subjectSlug,
      teachingUser,
    });

  if (!context) {
    notFound();
  }

  const pageData =
    await loadReviewModulePageData({
      subjectSlug: args.subjectSlug,
      moduleSlug: args.moduleSlug,
      locale: args.locale,
      nextPath:
        `/${encodeURIComponent(args.locale)}` +
        `/teacher-classes/${encodeURIComponent(args.classId)}` +
        `/subjects/${encodeURIComponent(args.subjectSlug)}` +
        `/modules/${encodeURIComponent(args.moduleSlug)}/learn`,
    });

  if (pageData.status === "missing") {
    notFound();
  }

  const backHref =
    resolveTeacherAppHref({
      locale: args.locale,
      pathname:
        `/classes/${encodeURIComponent(args.classId)}`,
    }) ??
    `/${encodeURIComponent(args.locale)}` +
      `/admin/learning-groups/${encodeURIComponent(args.classId)}`;

  const createAssignmentBaseHref =
    resolveTeacherAppHref({
      locale: args.locale,
      pathname: "/assignments/new",
    }) ??
    `/${encodeURIComponent(args.locale)}` +
      "/admin/course-assignments/new";

  const createAssignmentHref =
    `${createAssignmentBaseHref}` +
    `?subjectId=${encodeURIComponent(context.subject.id)}` +
    `&classId=${encodeURIComponent(args.classId)}`;

  const supplementalHeader = (
    <ClassCourseWorkspaceBar
      className={context.group.name}
      courseTitle={context.subject.title}
      backHref={backHref}
      createAssignmentHref={createAssignmentHref}
    />
  );

  if (pageData.status === "unavailable") {
    return (
      <ReviewModulePageClient
        canUnlockAll={pageData.canUnlockAll}
        mod={null}
        pageStatus="unavailable"
        routePrefix={routePrefix}
        supplementalHeader={supplementalHeader}
      />
    );
  }

  return (
    <ReviewModulePageClient
      canUnlockAll={pageData.canUnlockAll}
      mod={pageData.mod}
      pageStatus="ready"
      routePrefix={routePrefix}
      supplementalHeader={supplementalHeader}
    />
  );
}
