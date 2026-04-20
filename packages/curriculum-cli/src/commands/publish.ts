import {
    loadBlueprint,
    compileSubject,
    publishDraft,
    rebuildRegistries,
} from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runPublish(blueprintPath: string) {
    const blueprint = await loadBlueprint(blueprintPath);
    const out = await compileSubject({ blueprint, provider: openAiProvider });

    await publishDraft({
        subjectSlug: blueprint.subjectSlug,
        topicPacks: out.topicPacks,
    });

    rebuildRegistries(blueprint.subjectSlug);
    console.log(`Published subject ${blueprint.subjectSlug}`);
}