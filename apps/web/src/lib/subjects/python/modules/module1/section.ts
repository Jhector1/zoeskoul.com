import {defineSection} from "@/lib/subjects/_core/defineSection";
import {DATA_TYPES_INTRO_TOPIC,} from "./topics/data_types_intro";
import {ERRORS_INTRO_TOPIC} from "./topics/errors_intro";
import {VARIABLES_INTRO_TOPIC} from "@/lib/subjects/python/modules/module1/topics/variables";
import {STRING_BASICS_TOPIC} from "@/lib/subjects/python/modules/module1/topics/string_basics";
import {INPUT_OUTPUT_PATTERNS_TOPIC} from "@/lib/subjects/python/modules/module1/topics/input_output_patterns";
import {OPERATORS_EXPRESSIONS_TOPIC} from "@/lib/subjects/python/modules/module1/topics/operators_expressions";
import {PY_SECTION_MOD1} from "./meta";

export const PY_MODULE1_SECTION = defineSection({
    section: {
        slug: PY_SECTION_MOD1,
        order: 1,
        title: "Module 1 — Core Building Blocks",
        description: "Variables/types, operators/expressions, strings, and mini-program patterns.",
        meta: {
            module: 1,
            weeks: "Weeks 3–5",
            bullets: [
                "Variables + data types",
                "Operators + expressions",
                "String basics + clean output",
                "Ask → Convert → Compute → Show mini-programs",
            ],
        },
    },
    topics: [
        VARIABLES_INTRO_TOPIC,
        ERRORS_INTRO_TOPIC,


        DATA_TYPES_INTRO_TOPIC,
        OPERATORS_EXPRESSIONS_TOPIC,

        STRING_BASICS_TOPIC,
        INPUT_OUTPUT_PATTERNS_TOPIC,
        // other module1 topics...
    ],
});
