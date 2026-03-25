import {

    PY_SUBJECT_SLUG,
} from "@/lib/subjects/python/subject";

import { CONDITIONALS_BASICS_TOPIC } from "./topics/conditionals_basics";
import { LOOPS_BASICS_TOPIC } from "./topics/loops_basics";
import { LISTS_BASICS_TOPIC } from "./topics/lists_basics";
import { FUNCTIONS_BASICS_TOPIC } from "./topics/functions_basics";
import {PY_MOD2, PY_MOD2_PREFIX, PY_SECTION_MOD2} from "@/lib/subjects/python/modules/module2/meta";

export const PY_MODULE2 = {
    prefix: PY_MOD2_PREFIX,
    genKey: "python_part1",

    module: {
        slug: PY_MOD2,
        subjectSlug: PY_SUBJECT_SLUG,
        order: 2,
        title: "Module 2 — Control Flow + Collections",
        description:
            "Conditionals, loops, lists, and functions — stitched into story-based mini-projects.",
        weekStart: 6,
        weekEnd: 8,
        accessOverride: "paid",
        entitlementKey: `module:${PY_SUBJECT_SLUG}:${PY_MOD2}`,
        meta: {
            estimatedMinutes: 110,
            prereqs: ["Module 1 — Core Building Blocks"],
            outcomes: [
                "Use if/elif/else with comparisons and boolean logic",
                "Write while loops for validation and repeating actions",
                "Use for loops to iterate ranges and lists",
                "Create and use lists to store many values",
                "Write reusable functions with parameters and return values",
            ],
            why: [
                "This is where programs start to feel alive (decisions + repetition)",
                "Lists + functions unlock real mini-app structure",
            ],
        },
    },

    sections: [
        {
            section: {
                slug: PY_SECTION_MOD2,
                order: 2,
                title: "Module 2 — Control Flow + Collections",
                description:
                    "Conditionals, loops, lists, and functions — stitched into story-based mini-projects.",
                meta: {
                    module: 2,
                    weeks: "Weeks 6–8",
                    bullets: [
                        "Conditionals (if / elif / else + boolean logic)",
                        "Loops (while / for / break / continue)",
                        "Lists (store many values + iterate)",
                        "Functions (parameters, return, reuse)",
                    ],
                },
            },
            topics: [
                CONDITIONALS_BASICS_TOPIC,
                LOOPS_BASICS_TOPIC,
                LISTS_BASICS_TOPIC,
                FUNCTIONS_BASICS_TOPIC,
            ],
        },
    ],
} as const;