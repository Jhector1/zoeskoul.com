import {
    assertPublishGate,
    buildPublishGateResult,
    loadBlueprint,
    publishDraft,
    resolveSubjectPublishTarget,
} from "@zoeskoul/curriculum-compiler";

function looksLikeBlueprintPath(value: string) {
    return value.endsWith(".json") || value.includes("/") || value.includes("\\");
}

export async function runPublishAuto(input: string) {
    const blueprint = looksLikeBlueprintPath(input) ? await loadBlueprint(input) : null;
    const target = await resolveSubjectPublishTarget(blueprint?.subjectSlug ?? input);

    const gate = await buildPublishGateResult({
        subjectSlug: target.liveSubjectSlug,
        profileId: target.blueprint.profileId,
    });

    assertPublishGate(gate);

    await publishDraft({
        subjectSlug: target.liveSubjectSlug,
    });

    console.log(`Auto-published subject ${target.liveSubjectSlug}`);
}
