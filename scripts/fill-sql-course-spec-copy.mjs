// scripts/fill-sql-course-spec-copy.mjs

import fs from "node:fs/promises";
import path from "node:path";

const SPEC_PATH = path.resolve("authoring/sql/course.spec.json");
const OUTPUT_PATH = path.resolve("authoring/sql/course.spec.filled.json");

const SECTION_DESCRIPTIONS = {
    "section-0-1-what-sql-is":
        "Start with the big picture: what SQL is, why people use it, and how it helps answer questions from data.",
    "section-0-2-understanding-tables":
        "Learn how tables organize information through rows, columns, records, fields, and clear names.",
    "section-0-3-database-thinking":
        "Build the mental model for organizing data, connecting tables, and turning real questions into database questions.",
    "section-0-4-first-sql-environment":
        "Get comfortable with where SQL runs, how editors work, and how to read the results of a first query.",

    "section-1-1-intro-to-select":
        "Learn the purpose of SELECT and how a basic query asks a table for information.",
    "section-1-2-reading-data-from-a-table":
        "Practice choosing useful columns and reading clean results from a single table.",
    "section-1-3-sql-syntax-basics":
        "Understand the small syntax details that make SQL readable and valid, including keywords, semicolons, and casing.",
    "section-1-4-practice-with-basic-queries":
        "Strengthen the basic SELECT pattern by querying one column, multiple columns, and full tables.",

    "section-2-1-intro-to-filtering":
        "Learn why filtering matters and how WHERE keeps only the rows that answer the question.",
    "section-2-2-comparison-operators":
        "Use comparison operators to match exact values, ranges, and numeric conditions correctly.",
    "section-2-3-filtering-with-multiple-conditions":
        "Combine conditions with AND, OR, and NOT while keeping the query logic clear.",
    "section-2-4-beginner-filtering-practice":
        "Apply filtering skills to text, numbers, and multi-rule questions while avoiding common mistakes.",

    "section-3-1-sorting-data":
        "Learn how ORDER BY changes the order of results so the most useful rows are easier to see.",
    "section-3-2-sorting-by-multiple-columns":
        "Practice sorting by more than one column and understand how SQL handles ties.",
    "section-3-3-limiting-output":
        "Use LIMIT with sorting to focus on the top, bottom, newest, or most relevant rows.",
    "section-3-4-practice-with-output-control":
        "Build clearer result sets by combining sorting, limiting, and careful result reading.",

    "section-4-1-text-matching":
        "Search text with LIKE and wildcards so queries can handle partial matches and flexible patterns.",
    "section-4-2-lists-and-ranges":
        "Use IN, NOT IN, and BETWEEN to write cleaner filters for lists and ranges.",
    "section-4-3-missing-data":
        "Understand NULL and learn the right way to find missing or present values.",
    "section-4-4-practice":
        "Combine text matching, list filters, ranges, and NULL checks in practical search problems.",

    "section-5-1-creating-new-values-in-queries":
        "Create useful calculated values directly inside SELECT statements using arithmetic and expressions.",
    "section-5-2-column-aliases":
        "Rename calculated and selected columns so query results are easier to read and explain.",
    "section-5-3-simple-functions":
        "Explore beginner-friendly SQL functions for text, numbers, and dates without overcomplicating the query.",
    "section-5-4-expression-practice":
        "Use expressions and aliases to build simple report-style outputs such as totals, discounts, and renamed columns.",

    "section-6-1-intro-to-aggregation":
        "Move from individual rows to summary answers by learning what aggregate functions do.",
    "section-6-2-core-aggregate-functions":
        "Practice COUNT, SUM, AVG, MIN, and MAX as the core tools for summarizing data.",
    "section-6-3-aggregates-with-filters":
        "Combine WHERE with aggregates to summarize only the rows that matter.",
    "section-6-4-aggregate-practice":
        "Build small summary reports using counts, totals, averages, highest values, and lowest values.",

    "section-7-1-intro-to-grouping":
        "Learn how GROUP BY turns many rows into summaries by category, person, product, or team.",
    "section-7-2-aggregates-with-groups":
        "Use aggregate functions with groups to calculate counts, totals, averages, minimums, and maximums per category.",
    "section-7-3-filtering-groups":
        "Understand HAVING and how it filters grouped summaries differently from WHERE.",
    "section-7-4-grouping-practice":
        "Create grouped reports for sales, orders, departments, and dashboard-style summaries.",

    "section-8-1-why-multiple-tables-exist":
        "Understand why databases split related information across tables and how IDs connect that data.",
    "section-8-2-inner-join":
        "Learn INNER JOIN by matching related rows from two tables and reading the combined result.",
    "section-8-3-left-join":
        "Use LEFT JOIN to keep unmatched rows and understand why NULL appears in joined results.",
    "section-8-4-join-practice":
        "Practice choosing the right join for common relationships like customers and orders, students and courses, and products and categories.",

    "section-9-1-aliases-for-tables-and-columns":
        "Use table and column aliases to make longer queries shorter, clearer, and easier to maintain.",
    "section-9-2-query-formatting":
        "Format SQL across lines with indentation so the structure of the query is easy to follow.",
    "section-9-3-comments-and-readability":
        "Add helpful comments and readable names without cluttering queries or hiding the logic.",
    "section-9-4-clean-query-practice":
        "Refactor messy SQL into clean query examples that are easier to debug, review, and explain.",

    "section-10-1-what-a-subquery-is":
        "Introduce subqueries as queries inside other queries and learn when that pattern is useful.",
    "section-10-2-subqueries-in-where":
        "Use subqueries inside WHERE to compare rows against calculated values or lists of results.",
    "section-10-3-subqueries-in-from":
        "Treat a subquery as a temporary result set that another query can build on.",
    "section-10-4-subquery-practice":
        "Practice solving beginner problems with subqueries and compare them with join-based thinking.",

    "section-11-1-intro-to-adding-data":
        "Learn what INSERT INTO does and how SQL adds new rows to a table.",
    "section-11-2-safe-inserting":
        "Use explicit column lists and type awareness to make insert statements safer and easier to debug.",
    "section-11-3-insert-with-null-and-defaults":
        "Understand how missing values, NULL, optional columns, and defaults affect inserted rows.",
    "section-11-4-insert-practice":
        "Practice adding students, products, and multiple records, then checking the inserted data.",

    "section-12-1-updating-rows":
        "Learn how UPDATE changes existing rows and why WHERE is critical before making changes.",
    "section-12-2-deleting-rows":
        "Use DELETE carefully by selecting target rows first and avoiding accidental full-table deletion.",
    "section-12-3-data-safety-mindset":
        "Build safe habits for previewing, backing up, and thinking before changing data.",
    "section-12-4-practice-with-data-changes":
        "Practice updating prices, changing statuses, deleting test rows, and following a safe modification workflow.",

    "section-13-1-intro-to-table-design":
        "Learn what CREATE TABLE does and how clear column choices shape the future database.",
    "section-13-2-common-data-types":
        "Choose beginner-friendly data types for integers, text, decimals, dates, and times.",
    "section-13-3-constraints":
        "Use constraints like PRIMARY KEY, NOT NULL, UNIQUE, and FOREIGN KEY to protect data quality.",
    "section-13-4-table-design-practice":
        "Design and create simple tables, then connect them with keys in a small relational structure.",

    "section-14-1-why-relationships-matter":
        "Recognize how real-world relationships become one-to-one, one-to-many, and many-to-many database patterns.",
    "section-14-2-keys-and-relationships":
        "Review primary and foreign keys as the foundation for linking tables properly.",
    "section-14-3-good-beginner-design-habits":
        "Build better table designs by reducing duplication, keeping tables focused, and planning for future queries.",
    "section-14-4-relational-design-practice":
        "Turn real scenarios like stores, enrollments, and orders into beginner-friendly relational designs.",

    "section-15-1-mini-project-student-database":
        "Plan a small student database, insert sample data, and answer useful questions with SQL.",
    "section-15-2-mini-project-store-database":
        "Design a store database with products, customers, orders, and sales queries.",
    "section-15-3-mini-project-employee-database":
        "Create employee and department reports using salary analysis, summaries, and joined data.",
    "section-15-4-capstone-practice":
        "Bring the full course together by asking business questions, writing complete SQL solutions, and explaining the logic."
};

function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function uniqueNonEmpty(values) {
    return Array.from(
        new Set(values.map((value) => cleanText(value)).filter(Boolean)),
    );
}

function moduleDescriptionFallback(module) {
    const existing = cleanText(module.description);
    if (existing) return existing;

    const purpose = cleanText(module.purpose);
    if (purpose) return purpose;

    return `Learn the main SQL skills in ${cleanText(module.title)}.`;
}

function fallbackSectionDescription(module, section) {
    const topicTitles = Array.isArray(section.topics)
        ? section.topics.map((topic) => cleanText(topic.title)).filter(Boolean)
        : [];

    if (topicTitles.length >= 2) {
        return `Practice ${topicTitles.slice(0, 3).join(", ").toLowerCase()} in the context of ${cleanText(module.title).toLowerCase()}.`;
    }

    return `Explore ${cleanText(section.title).toLowerCase()} with examples connected to ${cleanText(module.title).toLowerCase()}.`;
}

function buildWeeksLabel(module, section, sectionIndex) {
    const existing = cleanText(section.weeksLabel);
    if (existing) return existing;

    const sectionNumber = cleanText(section.sectionNumber);
    if (sectionNumber) {
        return `Module ${module.moduleNumber}, Section ${sectionNumber}`;
    }

    return `Module ${module.moduleNumber}, Section ${sectionIndex + 1}`;
}

function fillCourseSpec(spec) {
    const next = structuredClone(spec);

    next.sourceLocale = cleanText(next.sourceLocale) || "en";

    if (!Array.isArray(next.targetLocales) || next.targetLocales.length === 0) {
        next.targetLocales = ["fr", "ht", "es"];
    } else {
        next.targetLocales = uniqueNonEmpty(next.targetLocales).filter(
            (locale) => locale !== next.sourceLocale,
        );
    }

    next.modules = (Array.isArray(next.modules) ? next.modules : []).map(
        (module, moduleIndex) => {
            const sections = Array.isArray(module.sections) ? module.sections : [];

            const filledModule = {
                ...module,
                order:
                    typeof module.order === "number" && Number.isFinite(module.order)
                        ? module.order
                        : moduleIndex + 1,
                description: moduleDescriptionFallback(module),
            };

            filledModule.sections = sections.map((section, sectionIndex) => {
                const topics = Array.isArray(section.topics) ? section.topics : [];
                const topicTitles = topics.map((topic) => cleanText(topic.title));

                const bullets = uniqueNonEmpty([
                    ...(Array.isArray(section.bullets) ? section.bullets : []),
                    ...topicTitles,
                ]).slice(0, 4);

                const curatedDescription =
                    SECTION_DESCRIPTIONS[cleanText(section.sectionSlug)];

                return {
                    ...section,
                    order:
                        typeof section.order === "number" && Number.isFinite(section.order)
                            ? section.order
                            : sectionIndex + 1,
                    description:
                        cleanText(section.description) ||
                        curatedDescription ||
                        fallbackSectionDescription(module, section),
                    weeksLabel: buildWeeksLabel(module, section, sectionIndex),
                    bullets,
                    topics,
                };
            });

            filledModule.sectionCount = filledModule.sections.length;
            filledModule.topicCount = filledModule.sections.reduce(
                (sum, section) =>
                    sum + (Array.isArray(section.topics) ? section.topics.length : 0),
                0,
            );

            return filledModule;
        },
    );

    return next;
}

const raw = await fs.readFile(SPEC_PATH, "utf8");
const spec = JSON.parse(raw);
const filled = fillCourseSpec(spec);

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(filled, null, 2)}\n`);

console.log(`Generated: ${OUTPUT_PATH}`);
console.log(`sourceLocale: ${filled.sourceLocale}`);
console.log(`targetLocales: ${filled.targetLocales.join(", ")}`);
console.log(`modules: ${filled.modules.length}`);
console.log(
    `sections: ${filled.modules.reduce((sum, module) => sum + module.sections.length, 0)}`,
);
console.log(
    `topics: ${filled.modules.reduce(
        (sum, module) =>
            sum +
            module.sections.reduce(
                (sectionSum, section) => sectionSum + section.topics.length,
                0,
            ),
        0,
    )}`,
);