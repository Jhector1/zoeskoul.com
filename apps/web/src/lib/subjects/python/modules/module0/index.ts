import { defineModule } from "@/lib/subjects/_core/defineModule";
import {  PY_SUBJECT_SLUG } from "../../subject";
import { PY_MODULE0_SECTION } from "./section";
import {PY_MOD0,PY_MOD0_PREFIX} from "./meta";

export const PY_MODULE0 = defineModule({
    module: {
        slug: PY_MOD0,
        subjectSlug: PY_SUBJECT_SLUG,
        order: 0,
        title: "Module 0 — Foundations",
        description: "Workspace + programming basics: IPO model, syntax, and comments.",
        weekStart: 0,
        weekEnd: 2,
        accessOverride: "free",
        entitlementKey: `module:${PY_SUBJECT_SLUG}:${PY_MOD0}`,
        meta: {
            estimatedMinutes: 40,
            prereqs: ["None — you can start here"],
            outcomes: [
                "Navigate the editor, Run button, and terminal",
                "Explain Input → Processing → Output",
                "Understand what syntax is and why SyntaxError happens",
                "Use # comments intentionally while learning",
            ],
            why: [
                "Sets up the mental model + workspace skills",
                "Prevents beginner confusion before writing bigger programs",
            ],
        },
    },
    prefix: PY_MOD0_PREFIX,
    genKey: "python_part1",
    sections: [PY_MODULE0_SECTION],
});