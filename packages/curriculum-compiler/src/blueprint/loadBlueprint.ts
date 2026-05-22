import fs from "node:fs/promises";
import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import path from "node:path";
import {
  applyResolvedPolicyToBlueprint,
  resolveAuthoringPolicyChain,
} from "../policy/resolveAuthoringPolicyChain.js";

function parseAuthoringCoursePath(filePath: string) {
  const parts = path.normalize(filePath).split(path.sep);
  const subjectsIndex = parts.lastIndexOf("subjects");
  const coursesIndex = parts.lastIndexOf("courses");

  if (
    subjectsIndex < 0 ||
    coursesIndex < 0 ||
    parts[coursesIndex + 2] !== "course.blueprint.json"
  ) {
    return null;
  }

  return {
    subjectSlug: parts[subjectsIndex + 1],
    courseSlug: parts[coursesIndex + 1],
  };
}

export async function loadBlueprint(path: string): Promise<CourseBlueprint> {
  const raw = await fs.readFile(path, "utf8");
  const blueprint = JSON.parse(raw) as CourseBlueprint;
  const authoringPath = parseAuthoringCoursePath(path);

  if (!authoringPath) {
    return blueprint;
  }

  const policy = await resolveAuthoringPolicyChain({
    subjectSlug: authoringPath.subjectSlug,
    courseSlug: authoringPath.courseSlug,
    includeProjectPolicy: true,
  });

  return applyResolvedPolicyToBlueprint(
    {
      ...blueprint,
      courseSlug: blueprint.courseSlug ?? authoringPath.courseSlug,
    },
    policy,
  ) as CourseBlueprint;
}
