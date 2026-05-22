import {
    loadBlueprint,
    publishDraft,
    resolveSubjectPublishTarget,
} from "@zoeskoul/curriculum-compiler";

function looksLikeBlueprintPath(value: string) {
    return value.endsWith(".json") || value.includes("/") || value.includes("\\");
}

export async function runPublish(input: string) {
    const subjectSlug = looksLikeBlueprintPath(input)
        ? (await loadBlueprint(input)).subjectSlug
        : input;
    const target = await resolveSubjectPublishTarget(subjectSlug);

    await publishDraft({
        subjectSlug: target.liveSubjectSlug,
    });

    // await rebuildRegistries();
}
