import { defineSection } from "@/lib/subjects/_core/defineSection";
import { SQL_SECTION_MOD3 } from "@/lib/subjects/sql/modules/module3/meta";

import { SORTING_DATA_TOPIC } from "@/lib/subjects/sql/modules/module3/topics/sorting_data";
import { SORTING_BY_MULTIPLE_COLUMNS_TOPIC } from "@/lib/subjects/sql/modules/module3/topics/sorting_by_multiple_columns";
import { LIMITING_OUTPUT_TOPIC } from "@/lib/subjects/sql/modules/module3/topics/limiting_output";
import { PRACTICE_WITH_OUTPUT_CONTROL_TOPIC } from "@/lib/subjects/sql/modules/module3/topics/practice_with_output_control";

export const SQL_MODULE3_SECTION = defineSection({
    section: {
        slug: SQL_SECTION_MOD3,
        order: 1,
        title: "Module 3 — Sorting and Limiting Results",
        description:
            "Learn how to sort results clearly, rank rows with confidence, limit output to the most relevant records, and practice building readable result sets.",
        meta: {
            module: 3,
            weeks: "Week 5–6",
            bullets: [
                "Sorting data",
                "Sorting by multiple columns",
                "Limiting output",
                "Practice with output control",
            ],
        },
    },
    topics: [
        SORTING_DATA_TOPIC,
        SORTING_BY_MULTIPLE_COLUMNS_TOPIC,
        LIMITING_OUTPUT_TOPIC,
        PRACTICE_WITH_OUTPUT_CONTROL_TOPIC,
    ],
});