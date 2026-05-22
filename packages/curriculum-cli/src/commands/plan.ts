import { loadBlueprint, loadSubjectPlan, savePlan } from "@zoeskoul/curriculum-compiler";
import { generateCoursePlan, openAiProvider } from "@zoeskoul/curriculum-ai";
import {selectModelFromConsole} from "../utils/selectModel.js";

export async function runPlan(blueprintPath: string) {
  await selectModelFromConsole();

  const blueprint = await loadBlueprint(blueprintPath);
  const plan = await generateCoursePlan(openAiProvider, blueprint);
  const subjectPlan = await loadSubjectPlan(blueprint.subjectSlug);
  const courseSlug =
      (blueprint as { courseSlug?: string }).courseSlug ??
      subjectPlan?.publishTarget?.courseSlug;

  if (!courseSlug) {
    throw new Error(
        `Could not resolve courseSlug for plan output from ${blueprint.subjectSlug}`,
    );
  }

  const savedPath = await savePlan(blueprint.subjectSlug, courseSlug, plan);

  console.log(`Saved plan to ${savedPath}`);
  console.log(JSON.stringify(plan, null, 2));
}
