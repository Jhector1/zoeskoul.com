import {
    loadBlueprint,
    validateCourseSpecForSubject,
} from "@zoeskoul/curriculum-compiler";

function looksLikeBlueprintPath(value: string) {
    return value.endsWith(".json") || value.includes("/") || value.includes("\\");
}

export async function runValidateSpec(input: string) {
    let subjectSlug = input;

    if (looksLikeBlueprintPath(input)) {
        const blueprint = await loadBlueprint(input);
        subjectSlug = blueprint.subjectSlug;
    }

    const out = await validateCourseSpecForSubject(subjectSlug);

    console.log(`✔ Course spec is valid for subject ${out.subjectSlug}`);
    console.log(`Path: ${out.specPath}`);
    console.log(`Profile: ${out.profileId}`);
    console.log(
        `Full roadmap: ${out.fullModuleCount} modules, ${out.fullSectionCount} sections, ${out.fullTopicCount} topics`,
    );
    console.log(
        `Active release: ${out.activeReleaseName ?? "none"} -> ${out.activeModuleCount} modules, ${out.activeSectionCount} sections, ${out.activeTopicCount} topics`,
    );
}