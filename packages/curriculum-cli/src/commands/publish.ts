import {
    loadBlueprint,
    publishDraft,
} from "@zoeskoul/curriculum-compiler";

export async function runPublish(blueprintPath: string) {
    const blueprint = await loadBlueprint(blueprintPath);

    await publishDraft({
        subjectSlug: blueprint.subjectSlug,
    });

    // await rebuildRegistries();
}