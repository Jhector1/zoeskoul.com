import { defineSection } from "@/lib/subjects/_core/defineSection";
import { SQL_SECTION_MOD4 } from "@/lib/subjects/sql/modules/module4/meta";

import { TEXT_MATCHING_TOPIC } from "@/lib/subjects/sql/modules/module4/topics/text_matching";
import { LISTS_AND_RANGES_TOPIC } from "@/lib/subjects/sql/modules/module4/topics/lists_and_ranges";
import { MISSING_DATA_TOPIC } from "@/lib/subjects/sql/modules/module4/topics/missing_data";
import { SEARCH_AND_CLEANUP_PRACTICE_TOPIC } from "@/lib/subjects/sql/modules/module4/topics/search_and_cleanup_practice";

export const SQL_MODULE4_SECTION = defineSection({
    section: {
        slug: SQL_SECTION_MOD4,
        order: 1,
        title: "Module 4 — Working with Text, Lists, Ranges, and NULL",
        description:
            "Learn how to match partial text with LIKE, filter lists and ranges with IN and BETWEEN, and handle missing values safely with NULL checks.",
        meta: {
            module: 4,
            weeks: "Week 7–8",
            bullets: [
                "Text matching",
                "Lists and ranges",
                "Missing data",
                "Search and cleanup practice",
            ],
        },
    },
    topics: [
        TEXT_MATCHING_TOPIC,
        LISTS_AND_RANGES_TOPIC,
        MISSING_DATA_TOPIC,
        SEARCH_AND_CLEANUP_PRACTICE_TOPIC,
    ],
});