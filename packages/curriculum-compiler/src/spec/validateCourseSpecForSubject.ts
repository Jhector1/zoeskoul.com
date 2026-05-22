import type { CourseSpec } from "@zoeskoul/curriculum-contracts";
import { getAuthoringCourseSpecPath } from "@zoeskoul/curriculum-core";
import { loadCourseSpec, loadSubjectPlan } from "./loadCourseSpec.js";
import {validateCourseSpecWorkspaceLanguage} from "../validate/validateCourseSpecWorkspaceLanguage.js";

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
    const subjectPlan = await loadSubjectPlan(subjectSlug);
    if (!subjectPlan) {
        throw new Error(`No subject plan found for ${subjectSlug}`);
    }

    const courseSlug = subjectPlan.publishTarget?.courseSlug;
    if (!courseSlug) {
        throw new Error(`Subject plan for ${subjectSlug} is missing publishTarget.courseSlug`);
    }

    const specPath = getAuthoringCourseSpecPath(subjectSlug, courseSlug);
    const releasedSpec = await loadCourseSpec(subjectSlug, courseSlug);

    if (!releasedSpec) {
        throw new Error(`No course spec found at ${specPath}`);
    }

    validateCourseSpecWorkspaceLanguage({ spec:releasedSpec });

    return {
        subjectSlug: releasedSpec.subjectSlug,
        profileId: releasedSpec.profileId,
        specPath,
        fullModuleCount: releasedSpec.modules.length,
        fullSectionCount: countSections(releasedSpec),
        fullTopicCount: countTopics(releasedSpec),
        activeModuleCount: releasedSpec.modules.length,
        activeSectionCount: countSections(releasedSpec),
        activeTopicCount: countTopics(releasedSpec),
        activeReleaseName: releasedSpec.releasePlan?.currentRelease?.name ?? null,
        spec: releasedSpec,
    };
}
