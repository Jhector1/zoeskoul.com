import fs from "node:fs/promises";
import path from "node:path";
import type { CourseSpec } from "@zoeskoul/curriculum-contracts";
import { normalizeLegacyCourseSpec } from "./normalizeLegacyCourseSpec.js";
import { resolveSpecRelease } from "./resolveSpecRelease.js";
import { assertCourseSpecIntegrity } from "./validateCourseSpec.js";

async function pathExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function loadCourseSpec(
    subjectSlug: string,
): Promise<CourseSpec | null> {
    const filePath = path.join("authoring", subjectSlug, "course.spec.json");

    if (!(await pathExists(filePath))) {
        return null;
    }

    const rawText = await fs.readFile(filePath, "utf8");
    const rawJson = JSON.parse(rawText);

    const fullSpec = normalizeLegacyCourseSpec(rawJson);
    assertCourseSpecIntegrity(fullSpec);

    const releasedSpec = resolveSpecRelease(fullSpec);
    assertCourseSpecIntegrity(releasedSpec);

    return releasedSpec;
}