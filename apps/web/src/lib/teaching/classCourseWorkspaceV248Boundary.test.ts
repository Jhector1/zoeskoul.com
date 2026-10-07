import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const root = resolve(process.cwd());
const source = (path: string) =>
  readFileSync(resolve(root, path), "utf8");

const domain = source(
  "apps/web/src/lib/learningGroups/classCourseWorkspace.ts",
);
const player = source(
  "apps/web/src/components/teaching/class-course-workspace/ClassCourseWorkspacePage.tsx",
);
const entry = source(
  "apps/web/src/app/(public)/[locale]/(learningZone)/teacher-classes/[classId]/subjects/[subjectSlug]/page.tsx",
);
const modulePage = source(
  "apps/web/src/app/(public)/[locale]/(learningZone)/teacher-classes/[classId]/subjects/[subjectSlug]/modules/[moduleSlug]/learn/page.tsx",
);
const targetPage = source(
  "apps/web/src/app/(public)/[locale]/(learningZone)/teacher-classes/[classId]/subjects/[subjectSlug]/modules/[moduleSlug]/learn/[sectionSlug]/[topicId]/[targetKind]/[targetSlug]/page.tsx",
);
const reviewClient = source(
  "apps/web/src/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient.tsx",
);

describe("Teacher class course workspace boundary V248", () => {
  it("reuses the canonical ReviewModulePageClient instead of the tutoring session wrapper", () => {
    expect(player).toContain("ReviewModulePageClient");
    expect(player).toContain("routePrefix");
    expect(player).toContain("supplementalHeader");
    expect(player).not.toContain("TutoringSessionPlayer");
    expect(player).not.toContain("tutoringSession=");
    expect(reviewClient).toContain("ReviewModuleView");
  });

  it("authorizes the class and proves the course belongs to it through assignments", () => {
    expect(domain).toContain("ownedTeachingRecordWhere");
    expect(domain).toContain("assignments: {");
    expect(domain).toContain("assignment: {");
    expect(domain).toContain("subject: {");
    expect(domain).toContain("slug: args.subjectSlug");
  });

  it("uses a compiled class course module as the entry point", () => {
    expect(domain).toContain("practiceModule.findMany");
    expect(domain).toContain("hasReviewModule");
    expect(entry).toContain("findFirstCompiledClassCourseModule");
    expect(entry).toContain("redirect(");
  });

  it("keeps class context across module and lesson routes without tutoring headers", () => {
    expect(modulePage).toContain("renderClassCourseWorkspacePage");
    expect(targetPage).toContain("renderClassCourseWorkspacePage");
    expect(player).toContain("/teacher-classes/");
    expect(player).not.toContain("x-zoeskoul-tutoring");
    expect(player).not.toContain("withTutoringContentRequestHeaders");
  });

  it("does not claim a learner preview mode that the audited runtime does not provide", () => {
    expect(player).not.toContain('previewMode="draftQa"');
    expect(player).not.toContain("Preview as learner");
  });
});
