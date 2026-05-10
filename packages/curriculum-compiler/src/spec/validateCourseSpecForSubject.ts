import path from "node:path";
import type { CourseSpec } from "@zoeskoul/curriculum-contracts";
import { normalizeLegacyCourseSpec } from "./normalizeLegacyCourseSpec.js";
import { resolveSpecRelease } from "./resolveSpecRelease.js";
import { validateCourseSpec } from "./validateCourseSpec.js";
import fs from "node:fs/promises";
import {validateCourseSpecWorkspaceLanguage} from "../validate/validateCourseSpecWorkspaceLanguage.js";

async function pathExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

function countSections(spec: CourseSpec) {
    return spec.modules.reduce((sum, module) => sum + module.sections.length, 0);
}

function countTopics(spec: CourseSpec) {
    return spec.modules.reduce(
        (sum, module) =>
            sum +
            module.sections.reduce(
                (sectionSum, section) => sectionSum + section.topics.length,
                0,
            ),
        0,
    );
}

export async function validateCourseSpecForSubject(subjectSlug: string): Promise<{
    subjectSlug: string;
    profileId: string;
    specPath: string;
    fullModuleCount: number;
    fullSectionCount: number;
    fullTopicCount: number;
    activeModuleCount: number;
    activeSectionCount: number;
    activeTopicCount: number;
    activeReleaseName: string | null;
    spec: CourseSpec;
}> {
    const specPath = path.join("authoring", subjectSlug, "course.spec.json");

    if (!(await pathExists(specPath))) {
        throw new Error(`No course spec found at ${specPath}`);
    }

    const rawText = await fs.readFile(specPath, "utf8");
    const rawJson = JSON.parse(rawText);

    const fullSpec = normalizeLegacyCourseSpec(rawJson);
    const fullIssues = validateCourseSpec(fullSpec);
    if (fullIssues.length) {
        throw new Error(`Course spec validation failed:\n- ${fullIssues.join("\n- ")}`);
    }

    const releasedSpec = resolveSpecRelease(fullSpec);
    const releasedIssues = validateCourseSpec(releasedSpec);

    if (releasedIssues.length) {
        throw new Error(
            `Released course spec validation failed:\n- ${releasedIssues.join("\n- ")}`,
        );
    }

    if (fullSpec.subjectSlug !== subjectSlug) {
        throw new Error(
            `Spec subjectSlug mismatch: expected "${subjectSlug}" but found "${fullSpec.subjectSlug}" in ${specPath}`,
        );
    }
    if (releasedSpec.subjectSlug !== subjectSlug) {
        throw new Error(
            `Released spec subjectSlug mismatch: expected "${subjectSlug}" but found "${releasedSpec.subjectSlug}" in ${specPath}`,
        );
    }
    validateCourseSpecWorkspaceLanguage({ spec:releasedSpec });

    return {
        subjectSlug: fullSpec.subjectSlug,
        profileId: fullSpec.profileId,
        specPath,
        fullModuleCount: fullSpec.modules.length,
        fullSectionCount: countSections(fullSpec),
        fullTopicCount: countTopics(fullSpec),
        activeModuleCount: releasedSpec.modules.length,
        activeSectionCount: countSections(releasedSpec),
        activeTopicCount: countTopics(releasedSpec),
        activeReleaseName: fullSpec.releasePlan?.currentRelease?.name ?? null,
        spec: releasedSpec,
    };
}