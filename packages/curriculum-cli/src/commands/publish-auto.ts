import {
    assertPublishGate,
    buildPublishGateResult,
    loadBlueprint,
    publishDraft,
} from "@zoeskoul/curriculum-compiler";

export async function runPublishAuto(blueprintPath: string) {
    const blueprint = await loadBlueprint(blueprintPath);

    const gate = await buildPublishGateResult({
        subjectSlug: blueprint.subjectSlug,
        profileId: blueprint.profileId,
    });

    assertPublishGate(gate);

    await publishDraft({
        subjectSlug: blueprint.subjectSlug,
    });

    console.log(`Auto-published subject ${blueprint.subjectSlug}`);
}