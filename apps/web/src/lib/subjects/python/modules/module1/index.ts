import { defineModule } from "@/lib/subjects/_core/defineModule";
import {  PY_SUBJECT_SLUG } from "../../subject";
import {PY_MODULE1_SECTION} from "@/lib/subjects/python/modules/module1/section";
import {PY_MOD1, PY_MOD1_PREFIX} from "@/lib/subjects/python/modules/module1/meta";



export const PY_MODULE1 = defineModule({
    module: {
        slug: PY_MOD1,
        subjectSlug: PY_SUBJECT_SLUG,
        order: 1,
        title: "Module 1 — Core Building Blocks",
        description: "Variables/types, operators/expressions, strings, and mini-program patterns.",
        weekStart: 3,
        weekEnd: 5,
        accessOverride: "free",
        // entitlementKey: `module:${PY_SUBJECT_SLUG}:${PY_MOD1}`,
        meta: {
            estimatedMinutes: 90,
            prereqs: ["Module 0 — Foundations"],
            outcomes: [
                "Store values in variables and explain types",
                "Use operators + expressions to compute results",
                "Work with strings (print, f-strings, indexing, methods)",
                "Build mini-programs using Ask → Convert → Compute → Show",
            ],
            why: [
                "These are the building blocks behind almost every beginner program",
                "Makes conditionals/loops feel natural in the next module",
            ],
        },
    },
    prefix: PY_MOD1_PREFIX,
    genKey: "python_part1",
    sections: [PY_MODULE1_SECTION],
});