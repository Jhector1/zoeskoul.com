import { loadBlueprint } from "@zoeskoul/curriculum-compiler";
import { generateCoursePlan, openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runPlan(blueprintPath: string) {
    const blueprint = await loadBlueprint(blueprintPath);
    const plan = await generateCoursePlan(openAiProvider, blueprint);
    console.log(JSON.stringify(plan, null, 2));
}