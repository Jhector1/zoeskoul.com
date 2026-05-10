import { loadBlueprint, savePlan } from "@zoeskoul/curriculum-compiler";
import { generateCoursePlan, openAiProvider } from "@zoeskoul/curriculum-ai";
import {selectModelFromConsole} from "../utils/selectModel.js";

export async function runPlan(blueprintPath: string) {
  await selectModelFromConsole();

  const blueprint = await loadBlueprint(blueprintPath);
  const plan = await generateCoursePlan(openAiProvider, blueprint);
  const savedPath = await savePlan(blueprint.subjectSlug, plan);

  console.log(`Saved plan to ${savedPath}`);
  console.log(JSON.stringify(plan, null, 2));
}