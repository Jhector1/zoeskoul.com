import { loadBlueprint } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";
import { generatePlan } from "@zoeskoul/curriculum-compiler";
import { compileTopic } from "@zoeskoul/curriculum-compiler";

export async function runCompileTopic(blueprintPath: string, topicId: string) {
    const blueprint = await loadBlueprint(blueprintPath);
    const plan = await generatePlan({ blueprint, provider: openAiProvider });

    for (const mod of plan.modules) {
        for (const sec of mod.sections) {
            for (const topic of sec.topics) {
                if (topic.topicId !== topicId) continue;

                const out = await compileTopic({
                    provider: openAiProvider,
                    subjectSlug: blueprint.subjectSlug,
                    profileId: blueprint.profileId,
                    sourceLocale: blueprint.sourceLocale,
                    targetLocales: blueprint.targetLocales,
                    moduleSlug: mod.moduleSlug,
                    sectionSlug: sec.sectionSlug,
                    topic,
                });

                console.log(JSON.stringify(out, null, 2));
                return;
            }
        }
    }

    throw new Error(`Topic not found in plan: ${topicId}`);
}