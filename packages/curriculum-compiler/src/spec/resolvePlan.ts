import type {
    CourseBlueprint,
    CoursePlan,
    CourseSpec,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateCoursePlan } from "@zoeskoul/curriculum-ai";
import { loadSavedPlan } from "../planning/loadSavedPlan.js";
import { savePlan } from "../planning/savePlan.js";
import { validatePlan } from "../validate/validatePlan.js";
import { buildPlanFromSpec } from "./buildPlanFromSpec.js";
import { loadCourseSpec } from "./loadCourseSpec.js";

export type ResolvedPlanSource = "spec" | "saved_plan" | "generated_plan";

export async function resolvePlan(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
}): Promise<{
    plan: CoursePlan;
    source: ResolvedPlanSource;
    spec: CourseSpec | null;
}> {
    const spec = await loadCourseSpec(args.blueprint.subjectSlug);

    if (spec) {
        const plan = buildPlanFromSpec({
            blueprint: args.blueprint,
            spec,
        });

        validatePlan(plan);

        return {
            plan,
            source: "spec",
            spec,
        };
    }

    let plan = await loadSavedPlan(args.blueprint.subjectSlug);

    if (plan) {
        validatePlan(plan);

        return {
            plan,
            source: "saved_plan",
            spec: null,
        };
    }

    plan = await generateCoursePlan(args.provider, args.blueprint);
    validatePlan(plan);
    await savePlan(args.blueprint.subjectSlug, plan);

    return {
        plan,
        source: "generated_plan",
        spec: null,
    };
}