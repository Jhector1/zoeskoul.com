import fs from "node:fs/promises";
import type { CourseSpec, SubjectPlan } from "@zoeskoul/curriculum-contracts";
import {
    getAuthoringCourseSpecPath,
    getAuthoringSubjectPlanPath,
} from "@zoeskoul/curriculum-core";
import { applyResolvedPolicyToBlueprint, resolveAuthoringPolicyChain } from "../policy/resolveAuthoringPolicyChain.js";
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
    courseSlug: string,
): Promise<CourseSpec | null> {
    const filePath = getAuthoringCourseSpecPath(subjectSlug, courseSlug);

    if (!(await pathExists(filePath))) {
        return null;
    }

    const rawText = await fs.readFile(filePath, "utf8");
    const rawJson = JSON.parse(rawText);

    const fullSpec = normalizeLegacyCourseSpec(rawJson);
    if (fullSpec.subjectSlug !== subjectSlug) {
        throw new Error(
            `Spec subjectSlug mismatch: expected "${subjectSlug}" but found "${fullSpec.subjectSlug}" in ${filePath}`,
        );
    }
    if (fullSpec.courseSlug !== courseSlug) {
        throw new Error(
            `Spec courseSlug mismatch: expected "${courseSlug}" but found "${fullSpec.courseSlug}" in ${filePath}`,
        );
    }
    assertCourseSpecIntegrity(fullSpec);

    const releasedSpec = resolveSpecRelease(fullSpec);
    if (releasedSpec.subjectSlug !== subjectSlug) {
        throw new Error(
            `Released spec subjectSlug mismatch: expected "${subjectSlug}" but found "${releasedSpec.subjectSlug}" in ${filePath}`,
        );
    }
    if (releasedSpec.courseSlug !== courseSlug) {
        throw new Error(
            `Released spec courseSlug mismatch: expected "${courseSlug}" but found "${releasedSpec.courseSlug}" in ${filePath}`,
        );
    }
    assertCourseSpecIntegrity(releasedSpec);

    const resolvedPolicy = await resolveAuthoringPolicyChain({
        subjectSlug,
        courseSlug,
        includeProjectPolicy: true,
    });

    return {
        ...(applyResolvedPolicyToBlueprint(releasedSpec, resolvedPolicy) as CourseSpec),
        resolvedAuthoringPolicy: resolvedPolicy,
    };
}

export async function loadSubjectPlan(subjectSlug: string): Promise<SubjectPlan | null> {
    const filePath = getAuthoringSubjectPlanPath(subjectSlug);

    if (!(await pathExists(filePath))) {
        return null;
    }

    const rawText = await fs.readFile(filePath, "utf8");
    return JSON.parse(rawText) as SubjectPlan;
}
