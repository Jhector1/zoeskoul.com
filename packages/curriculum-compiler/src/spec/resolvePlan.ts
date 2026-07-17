import type {
    CourseBlueprint,
    CoursePlan,
    CourseSpec,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateCoursePlan } from "@zoeskoul/curriculum-ai";
import { baseCourseGenerationPolicy } from "@zoeskoul/curriculum-profiles";
import { loadSavedPlan } from "../planning/loadSavedPlan.js";
import { savePlan } from "../planning/savePlan.js";
import { validatePlan } from "../validate/validatePlan.js";
import { buildPlanFromSpec } from "./buildPlanFromSpec.js";
import { loadCourseSpec, loadSubjectPlan } from "./loadCourseSpec.js";

export type ResolvedPlanSource = "spec" | "saved_plan" | "generated_plan";

export async function resolvePlan(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
}): Promise<{
    plan: CoursePlan;
    source: ResolvedPlanSource;
    spec: CourseSpec | null;
}> {
    const subjectPlan = await loadSubjectPlan(args.blueprint.subjectSlug);
    const courseSlug = subjectPlan?.publishTarget?.courseSlug ?? null;
    const spec = courseSlug
        ? await loadCourseSpec(args.blueprint.subjectSlug, courseSlug)
        : null;

    if (spec) {
        const plan = buildPlanFromSpec({
            blueprint: args.blueprint,
            spec,
        });

        validatePlan(plan, {
            requireFinalCapstone:
                spec.policy?.projectPolicy?.capstoneRequired ??
                baseCourseGenerationPolicy.projects.requireFinalCapstone,
        });

        return {
            plan,
            source: "spec",
            spec,
        };
    }

    let plan = courseSlug
        ? await loadSavedPlan(args.blueprint.subjectSlug, courseSlug)
        : null;

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
    if (courseSlug) {
        await savePlan(args.blueprint.subjectSlug, courseSlug, plan);
    }

    return {
        plan,
        source: "generated_plan",
        spec: null,
    };
}
