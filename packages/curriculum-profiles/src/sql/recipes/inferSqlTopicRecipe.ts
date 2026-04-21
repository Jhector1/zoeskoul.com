import type {
    SqlFillBlankRecipe,
    SqlMultiChoiceRecipe,
    SqlObjectiveRecipe,
    SqlPracticeRecipe,
    SqlReorderRecipe,
    SqlSingleChoiceRecipe,
    SqlSketchRecipe,
    SqlTopicRecipe,
    TopicPlanDraft,
} from "@zoeskoul/curriculum-contracts";
import { safeGoalList } from "../expanders/helpers.js";

function normalize(text: string): string {
    return text.toLowerCase();
}

function makeObjectives(goals: string[]): Record<string, SqlObjectiveRecipe> {
    return {
        obj_1: { statement: goals[0] },
        obj_2: { statement: goals[1] },
    };
}

function makeSingleChoice(args: {
    id: string;
    title: string;
    prompt: string;
    options: Record<"a" | "b" | "c" | "d", string>;
    correct: "a" | "b" | "c" | "d";
    conceptText: string;
    targetConceptIds: string[];
    targetObjectiveIds: string[];
    hint?: string;
    hint1?: string;
    hint2?: string;
}): SqlSingleChoiceRecipe {
    return {
        kind: "single_choice",
        id: args.id,
        title: args.title,
        prompt: args.prompt,
        options: args.options,
        correct: args.correct,
        conceptText: args.conceptText,
        targetConceptIds: args.targetConceptIds,
        targetObjectiveIds: args.targetObjectiveIds,
        ...(args.hint ? { hint: args.hint } : {}),
        ...(args.hint1 ? { hint1: args.hint1 } : {}),
        ...(args.hint2 ? { hint2: args.hint2 } : {}),
    };
}

function makeMultiChoice(args: {
    id: string;
    title: string;
    prompt: string;
    options: Record<"a" | "b" | "c" | "d" | "e", string>;
    correct: Array<"a" | "b" | "c" | "d" | "e">;
    conceptText: string;
    targetConceptIds: string[];
    targetObjectiveIds: string[];
    hint?: string;
    hint1?: string;
    hint2?: string;
}): SqlMultiChoiceRecipe {
    return {
        kind: "multi_choice",
        id: args.id,
        title: args.title,
        prompt: args.prompt,
        options: args.options,
        correct: args.correct,
        conceptText: args.conceptText,
        targetConceptIds: args.targetConceptIds,
        targetObjectiveIds: args.targetObjectiveIds,
        ...(args.hint ? { hint: args.hint } : {}),
        ...(args.hint1 ? { hint1: args.hint1 } : {}),
        ...(args.hint2 ? { hint2: args.hint2 } : {}),
    };
}

function makeReorder(args: {
    id: string;
    title: string;
    prompt: string;
    tokens: { t1: string; t2: string; t3: string };
    conceptText: string;
    targetConceptIds: string[];
    targetObjectiveIds: string[];
    hint?: string;
    hint1?: string;
    hint2?: string;
}): SqlReorderRecipe {
    return {
        kind: "drag_reorder",
        id: args.id,
        title: args.title,
        prompt: args.prompt,
        tokens: args.tokens,
        correct: ["t1", "t2", "t3"],
        conceptText: args.conceptText,
        targetConceptIds: args.targetConceptIds,
        targetObjectiveIds: args.targetObjectiveIds,
        ...(args.hint ? { hint: args.hint } : {}),
        ...(args.hint1 ? { hint1: args.hint1 } : {}),
        ...(args.hint2 ? { hint2: args.hint2 } : {}),
    };
}

function makeFillBlank(args: {
    id: string;
    title: string;
    prompt: string;
    template: string;
    choices: [string, string, string, string];
    correct: string;
    conceptText: string;
    targetConceptIds: string[];
    targetObjectiveIds: string[];
    hint?: string;
    hint1?: string;
    hint2?: string;
}): SqlFillBlankRecipe {
    return {
        kind: "fill_blank_choice",
        id: args.id,
        title: args.title,
        prompt: args.prompt,
        template: args.template,
        choices: args.choices,
        correct: args.correct,
        conceptText: args.conceptText,
        targetConceptIds: args.targetConceptIds,
        targetObjectiveIds: args.targetObjectiveIds,
        ...(args.hint ? { hint: args.hint } : {}),
        ...(args.hint1 ? { hint1: args.hint1 } : {}),
        ...(args.hint2 ? { hint2: args.hint2 } : {}),
    };
}

function makePractice(args: {
    id: string;
    title: string;
    prompt: string;
    datasetId: string;
    starterCode: string;
    solutionCode: string;
    conceptText: string;
    targetConceptIds: string[];
    targetObjectiveIds: string[];
    hint?: string;
    hint1?: string;
    hint2?: string;
}): SqlPracticeRecipe {
    return {
        kind: "code_input",
        id: args.id,
        title: args.title,
        prompt: args.prompt,
        datasetId: args.datasetId,
        starterCode: args.starterCode,
        solutionCode: args.solutionCode,
        conceptText: args.conceptText,
        targetConceptIds: args.targetConceptIds,
        targetObjectiveIds: args.targetObjectiveIds,
        ...(args.hint ? { hint: args.hint } : {}),
        ...(args.hint1 ? { hint1: args.hint1 } : {}),
        ...(args.hint2 ? { hint2: args.hint2 } : {}),
    };
}

function makeDefaultSketches(topicPlan: TopicPlanDraft, goals: string[]): Record<string, SqlSketchRecipe> {
    return {
        concept_overview: {
            cardTitle: `Overview: ${topicPlan.title}`,
            title: `What is ${topicPlan.title}?`,
            bodyMarkdown: [
                `${topicPlan.title} focuses on this idea: ${topicPlan.summary}`,
                "",
                "A good starting point is to say the requirement in plain language before writing SQL.",
                "",
                "### Learning goals",
                `- ${goals[0]}`,
                `- ${goals[1]}`,
            ].join("\n"),
        },
        goal_one: {
            cardTitle: goals[0],
            title: goals[0],
            bodyMarkdown: [
                `${goals[0]}.`,
                "",
                `When practicing ${topicPlan.title}, start with a focused example and verify the result carefully.`,
            ].join("\n"),
        },
        goal_two: {
            cardTitle: goals[1],
            title: goals[1],
            bodyMarkdown: [
                `${goals[1]}.`,
                "",
                `Use the topic idea to explain what the query is doing in plain English.`,
            ].join("\n"),
        },
        practice_note: {
            cardTitle: `How to practice ${topicPlan.title}`,
            title: `How to practice ${topicPlan.title}`,
            bodyMarkdown: [
                "Read the requirement, predict the result, run the query, and verify whether the output really answers the question.",
                "",
                `That habit is especially important for ${topicPlan.title}.`,
            ].join("\n"),
        },
    };
}

function makeOrientationSketches(topicPlan: TopicPlanDraft, goals: string[]): Record<string, SqlSketchRecipe> {
    return {
        overview: {
            cardTitle: `Overview: ${topicPlan.title}`,
            title: `What is ${topicPlan.title}?`,
            bodyMarkdown: [
                `${topicPlan.title} focuses on this idea: ${topicPlan.summary}`,
                "",
                "This is a foundation topic. The main goal is understanding the concept clearly before worrying about syntax.",
                "",
                "### Learning goals",
                `- ${goals[0]}`,
                `- ${goals[1]}`,
            ].join("\n"),
        },
        context: {
            cardTitle: `Why ${topicPlan.title} matters`,
            title: `Why ${topicPlan.title} matters`,
            bodyMarkdown: [
                `${topicPlan.title} gives learners context they will use in later SQL work.`,
                "",
                "Understanding the idea first makes later query practice easier and less mechanical.",
            ].join("\n"),
        },
        key_takeaway: {
            cardTitle: `Main takeaway`,
            title: `Main takeaway for ${topicPlan.title}`,
            bodyMarkdown: [
                "Try to explain the topic in plain English before writing anything technical.",
                "",
                "If you can describe the purpose clearly, you are much more likely to understand the syntax later.",
            ].join("\n"),
        },
        practice_note: {
            cardTitle: `How to study ${topicPlan.title}`,
            title: `How to study ${topicPlan.title}`,
            bodyMarkdown: [
                "Read the concept, compare examples, and explain the idea out loud in your own words.",
                "",
                "Meta topics do not always need a query-writing task to be useful.",
            ].join("\n"),
        },
    };
}

function ensureGoals(topicPlan: TopicPlanDraft): string[] {
    const raw = safeGoalList(topicPlan).filter(Boolean);
    const a = raw[0] ?? `Explain ${topicPlan.title} in plain language`;
    const b = raw[1] ?? `Apply the main idea of ${topicPlan.title}`;
    return [a, b];
}

function isOrientationTopic(text: string): boolean {
    return (
        text.includes("history") ||
        text.includes("editor") ||
        text.includes("client") ||
        text.includes("tool") ||
        text.includes("what sql") ||
        text.includes("what is sql") ||
        text.includes("database is") ||
        text.includes("real-world examples of databases")
    );
}

function isSelectingColumnsTopic(text: string): boolean {
    return (
        text.includes("selecting columns") ||
        text.includes("select specific columns") ||
        text.includes("selecting all columns") ||
        text.includes("select *") ||
        text.includes("query one column") ||
        text.includes("query multiple columns")
    );
}

function isFilteringTopic(text: string): boolean {
    return (
        text.includes("where") ||
        text.includes("filter") ||
        text.includes("comparison operator") ||
        text.includes(" and ") ||
        text.includes(" or ") ||
        text.includes(" not ")
    );
}

function isSortingTopic(text: string): boolean {
    return (
        text.includes("order by") ||
        text.includes("sort") ||
        text.includes("limit") ||
        text.includes("top 5") ||
        text.includes("highest values") ||
        text.includes("lowest values")
    );
}

function isTextNullTopic(text: string): boolean {
    return (
        text.includes("like") ||
        text.includes("null") ||
        text.includes("between") ||
        text.includes("in ") ||
        text.includes("not in") ||
        text.includes("text matching")
    );
}

function isCleanupTopic(text: string): boolean {
    return (
        text.includes("trim") ||
        text.includes("replace") ||
        text.includes("cleanup") ||
        text.includes("clean up")
    );
}

function isExpressionsTopic(text: string): boolean {
    return (
        text.includes("expression") ||
        text.includes("alias") ||
        text.includes("as") ||
        text.includes("calculated column") ||
        text.includes("math in sql") ||
        text.includes("function")
    );
}

function isAggregateTopic(text: string): boolean {
    return (
        text.includes("aggregate") ||
        text.includes("count") ||
        text.includes("sum") ||
        text.includes("avg") ||
        text.includes("min") ||
        text.includes("max")
    );
}

function isGroupByTopic(text: string): boolean {
    return text.includes("group by") || text.includes("having");
}

function isJoinTopic(text: string): boolean {
    return text.includes("join") || text.includes("primary key") || text.includes("foreign key");
}

function buildOrientationRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches = makeOrientationSketches(topicPlan, goals);

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["overview"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: topicPlan.summary,
                    b: "It is mainly about deleting rows from tables.",
                    c: "It only teaches numeric aggregation formulas.",
                    d: "It is only about sorting query results.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["overview", "context"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: topicPlan.summary,
                    b: goals[0],
                    c: "It is unrelated to learning SQL fundamentals.",
                    d: "It only applies after writing advanced joins.",
                    e: goals[1],
                },
                correct: ["a", "b", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Learning flow for ${topicPlan.title}`,
                prompt: `Reorder the learning flow for ${topicPlan.title}.`,
                conceptText: "Understand the idea first, connect it to SQL work, then explain it clearly.",
                targetConceptIds: ["overview", "key_takeaway"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "understand the core idea in plain English",
                    t2: "connect the idea to real SQL learning",
                    t3: "explain the concept clearly in your own words",
                },
            }),
        ],
    };
}

function buildSelectingColumnsRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches: Record<string, SqlSketchRecipe> = {
        specific_columns: {
            cardTitle: "Selecting only what you need",
            title: "Selecting specific columns keeps results focused.",
            bodyMarkdown: [
                "When you only need a few fields, select only those columns instead of returning everything.",
                "",
                "~~~sql",
                "SELECT name, price",
                "FROM products;",
                "~~~",
            ].join("\n"),
        },
        select_star: {
            cardTitle: "What does * mean?",
            title: "SELECT * returns all columns from the chosen table.",
            bodyMarkdown: [
                "The star is useful for quick exploration, but it is often too broad for real reports.",
                "",
                "~~~sql",
                "SELECT *",
                "FROM products;",
                "~~~",
            ].join("\n"),
        },
        result_reading: {
            cardTitle: "How should you read the result?",
            title: "Read the result set by checking the selected columns and the returned rows together.",
            bodyMarkdown: [
                "Always verify that the columns you selected match the question you were trying to answer.",
            ].join("\n"),
        },
        practice_note: {
            cardTitle: "How to practice selecting columns",
            title: "Practice by predicting which columns should appear before running the query.",
            bodyMarkdown: [
                "Say the desired output in plain English first, then write the SELECT list to match it.",
            ].join("\n"),
        },
    };

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makePractice({
                id: "practice_sql",
                title: `Practice: ${topicPlan.title}`,
                prompt:
                    "The `products` table already exists.\n\nWrite a query that shows only the `name` and `price` columns for five rows.\n\nThen run it.",
                datasetId: "products_catalog",
                starterCode:
                    "-- Show only the needed columns\nSELECT name, price\nFROM products\nLIMIT 5\n",
                solutionCode:
                    "SELECT name, price FROM products LIMIT 5;",
                conceptText: topicPlan.summary,
                targetConceptIds: ["specific_columns", "result_reading"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                hint: "Choose only the columns named in the question.",
                hint1: "Use SELECT name, price",
                hint2: "Use LIMIT 5 to keep the output short.",
            }),
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["specific_columns"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It is about retrieving only the columns you actually need from a table.",
                    b: "It permanently removes unused columns from the database.",
                    c: "It is only about sorting rows alphabetically.",
                    d: "It automatically joins multiple tables together.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["specific_columns", "select_star"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "Selecting specific columns can make a result easier to read.",
                    b: "SELECT * returns all columns.",
                    c: "Choosing columns has no effect on the result shape.",
                    d: "Selecting fewer columns can better match a real business question.",
                    e: "SELECT * is always the safest choice in production code.",
                },
                correct: ["a", "b", "d"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Choose the data need first, then write the select list, then verify the output.",
                targetConceptIds: ["specific_columns", "result_reading"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "identify which columns answer the question",
                    t2: "write those columns in the SELECT list",
                    t3: "run the query and verify the result set",
                },
            }),
            makeFillBlank({
                id: "keyword_fill",
                title: "Choosing columns",
                prompt: "Fill in the blank with the best SQL keyword.",
                conceptText: topicPlan.summary,
                targetConceptIds: ["specific_columns", "select_star"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                template: "A query that retrieves columns from a table usually begins with ____.",
                choices: ["SELECT", "TABLE", "GROUP BY", "DELETE"],
                correct: "SELECT",
            }),
        ],
    };
}

function buildFilteringRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches = makeDefaultSketches(topicPlan, goals);

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makePractice({
                id: "practice_sql",
                title: `Practice: ${topicPlan.title}`,
                prompt:
                    "The `products` table already exists.\n\nWrite a query that shows the `name` and `price` columns for rows whose `price` is greater than `50`.\n\nThen run it.",
                datasetId: "products_catalog",
                starterCode:
                    "-- Filter rows by price\nSELECT name, price\nFROM products\nWHERE price > 50\n",
                solutionCode:
                    "SELECT name, price FROM products WHERE price > 50;",
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview", "goal_one"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                hint: "Use WHERE with a comparison operator.",
                hint1: "Write the condition after FROM.",
                hint2: "Use price > 50.",
            }),
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It keeps only the rows that match a condition.",
                    b: "It permanently changes the schema.",
                    c: "It automatically groups records.",
                    d: "It only works with joins.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one", "goal_two"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "Filtering is often done with WHERE.",
                    b: "Comparison operators help define the row condition.",
                    c: "Filtering always changes the stored table data.",
                    d: "AND and OR can change which rows stay in the output.",
                    e: "Filtering is unrelated to business questions.",
                },
                correct: ["a", "b", "d"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Identify which rows should stay, write the condition, then verify the result.",
                targetConceptIds: ["goal_one", "practice_note"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "decide which rows should stay in the result",
                    t2: "write the condition in the WHERE clause",
                    t3: "run the query and verify the remaining rows",
                },
            }),
            makeFillBlank({
                id: "keyword_fill",
                title: "Filtering keyword",
                prompt: "Fill in the blank with the best SQL keyword.",
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one"],
                targetObjectiveIds: ["obj_1"],
                template: "The clause commonly used to filter rows is ____.",
                choices: ["WHERE", "GROUP BY", "INSERT", "CREATE"],
                correct: "WHERE",
            }),
        ],
    };
}

function buildSortingRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches: Record<string, SqlSketchRecipe> = {
        primary_sort: {
            cardTitle: "What is the main sort?",
            title: "The first sort rule controls the main order of the result.",
            bodyMarkdown: [
                "When you sort by more than one column, the first column listed has the strongest control over the order.",
            ].join("\n"),
        },
        secondary_sort: {
            cardTitle: "What breaks ties?",
            title: "A second sort rule helps order rows that tie on the first one.",
            bodyMarkdown: [
                "If two rows have the same value in the first sort column, the second sort column helps break the tie.",
            ].join("\n"),
        },
        limit_results: {
            cardTitle: "Why limit output?",
            title: "LIMIT keeps only the most relevant rows when you do not need the full result.",
            bodyMarkdown: [
                "ORDER BY and LIMIT are often used together to answer ranking-style questions like top values or newest rows.",
            ].join("\n"),
        },
        practice_note: {
            cardTitle: "How to practice output control",
            title: "Practice by predicting the order first, then verifying it after running the query.",
            bodyMarkdown: [
                "Say which rows should come first and why before you run the query.",
            ].join("\n"),
        },
    };

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makePractice({
                id: "practice_sql",
                title: `Practice: ${topicPlan.title}`,
                prompt:
                    "The `products` table already exists.\n\nWrite a query that shows the five most expensive products by sorting `price` from highest to lowest.\n\nThen run it.",
                datasetId: "products_catalog",
                starterCode:
                    "-- Show top priced rows\nSELECT name, price\nFROM products\nORDER BY price DESC\nLIMIT 5\n",
                solutionCode:
                    "SELECT name, price FROM products ORDER BY price DESC LIMIT 5;",
                conceptText: topicPlan.summary,
                targetConceptIds: ["primary_sort", "limit_results"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                hint: "Use ORDER BY with DESC, then LIMIT 5.",
                hint1: "Higher prices should appear first.",
                hint2: "LIMIT trims the output after sorting.",
            }),
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["primary_sort", "limit_results"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It controls the order and size of the output so results are easier to read.",
                    b: "It permanently changes values inside the table.",
                    c: "It only works with grouped queries.",
                    d: "It deletes rows after ranking them.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["primary_sort", "secondary_sort", "limit_results"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "ORDER BY changes the order of the result set.",
                    b: "LIMIT is often paired with ORDER BY.",
                    c: "A secondary sort can break ties.",
                    d: "Sorting always changes stored table data.",
                    e: "Descending order can help find highest values first.",
                },
                correct: ["a", "b", "c", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Choose the ordering rule, apply it, then trim the result if needed.",
                targetConceptIds: ["primary_sort", "limit_results"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "decide which rows should appear first",
                    t2: "write the ORDER BY rule",
                    t3: "apply LIMIT if only a few rows are needed",
                },
            }),
            makeFillBlank({
                id: "keyword_fill",
                title: "Sorting keyword",
                prompt: "Fill in the blank with the best SQL keyword.",
                conceptText: topicPlan.summary,
                targetConceptIds: ["primary_sort"],
                targetObjectiveIds: ["obj_1"],
                template: "The SQL clause used to sort query results is ____.",
                choices: ["ORDER BY", "GROUP BY", "DELETE", "VALUES"],
                correct: "ORDER BY",
            }),
        ],
    };
}

function buildTextNullRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches = makeDefaultSketches(topicPlan, goals);

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makePractice({
                id: "practice_sql",
                title: `Practice: ${topicPlan.title}`,
                prompt:
                    "The `products` table already exists.\n\nWrite a query that shows product names where the name contains the letter `a`.\n\nThen run it.",
                datasetId: "products_catalog",
                starterCode:
                    "-- Match text patterns\nSELECT name\nFROM products\nWHERE name LIKE '%a%'\n",
                solutionCode:
                    "SELECT name FROM products WHERE name LIKE '%a%';",
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview", "goal_one"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                hint: "Use LIKE with % wildcards.",
                hint1: "Put the letter inside a pattern like %a%",
                hint2: "Write the condition in WHERE.",
            }),
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It handles partial text matching, lists, ranges, and missing values.",
                    b: "It is only about table creation.",
                    c: "It always requires joining tables.",
                    d: "It permanently fixes bad data in storage.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one", "goal_two"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "LIKE can be used for pattern matching.",
                    b: "IS NULL checks for missing values.",
                    c: "BETWEEN can describe a range.",
                    d: "= NULL is the standard way to test for nulls.",
                    e: "IN can be cleaner than many OR conditions.",
                },
                correct: ["a", "b", "c", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Choose the matching/filtering idea first, then write the condition, then verify the rows.",
                targetConceptIds: ["goal_one", "practice_note"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "decide whether you are matching text, a list, a range, or nulls",
                    t2: "write the matching condition in WHERE",
                    t3: "run the query and verify the kept rows",
                },
            }),
            makeFillBlank({
                id: "keyword_fill",
                title: "Pattern matching keyword",
                prompt: "Fill in the blank with the best SQL keyword.",
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one"],
                targetObjectiveIds: ["obj_1"],
                template: "A common operator for basic text pattern matching is ____.",
                choices: ["LIKE", "CREATE", "DELETE", "ALTER"],
                correct: "LIKE",
            }),
        ],
    };
}

function buildCleanupRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches: Record<string, SqlSketchRecipe> = {
        trim_basics: {
            cardTitle: "What does TRIM do?",
            title: "TRIM removes unwanted spaces around text values.",
            bodyMarkdown: [
                "TRIM is useful when messy text has leading or trailing spaces.",
                "",
                "~~~sql",
                "SELECT TRIM('  Zoe  ');",
                "~~~",
            ].join("\n"),
        },
        replace_basics: {
            cardTitle: "What does REPLACE do?",
            title: "REPLACE swaps one piece of text for another.",
            bodyMarkdown: [
                "REPLACE can standardize inconsistent text patterns.",
            ].join("\n"),
        },
        cleanup_workflow: {
            cardTitle: "How do you clean text?",
            title: "Inspect the messy value, apply the cleanup function, then verify the result.",
            bodyMarkdown: [
                "Text cleanup is easier when you compare the original and cleaned version side by side.",
            ].join("\n"),
        },
        practice_note: {
            cardTitle: "How should you practice cleanup?",
            title: "Practice cleanup by showing raw and cleaned text together.",
            bodyMarkdown: [
                "That makes it easier to check whether the transformation really worked.",
            ].join("\n"),
        },
    };

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makePractice({
                id: "practice_sql",
                title: `Practice: ${topicPlan.title}`,
                prompt:
                    "The `products` table already exists.\n\nWrite a query that shows `name` and a cleaned version named `clean_name` where leading and trailing spaces are removed.\n\nThen run it.",
                datasetId: "products_catalog",
                starterCode:
                    "-- Clean text with TRIM\nSELECT name, TRIM(name) AS clean_name\nFROM products\nLIMIT 5\n",
                solutionCode:
                    "SELECT name, TRIM(name) AS clean_name FROM products LIMIT 5;",
                conceptText: topicPlan.summary,
                targetConceptIds: ["trim_basics", "cleanup_workflow"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                hint: "Use TRIM in the SELECT list and give the result an alias.",
                hint1: "TRIM removes leading and trailing spaces.",
                hint2: "Use AS clean_name.",
            }),
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["trim_basics", "replace_basics"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It uses text functions like TRIM and REPLACE to clean string values.",
                    b: "It permanently deletes rows with spaces.",
                    c: "It only sorts numbers.",
                    d: "It creates tables automatically.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["trim_basics", "replace_basics", "cleanup_workflow"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "TRIM can remove extra spaces around text.",
                    b: "REPLACE can substitute one text fragment for another.",
                    c: "Text cleanup always changes table schema.",
                    d: "Cleanup functions can help standardize messy values.",
                    e: "You can compare original and cleaned output in one query.",
                },
                correct: ["a", "b", "d", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Inspect the text, apply the cleanup function, then verify the cleaned result.",
                targetConceptIds: ["cleanup_workflow", "practice_note"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "inspect the messy text value",
                    t2: "apply the cleanup function in the query",
                    t3: "run the query and verify the cleaned output",
                },
            }),
            makeFillBlank({
                id: "keyword_fill",
                title: "Cleanup function",
                prompt: "Fill in the blank with the best SQL function.",
                conceptText: topicPlan.summary,
                targetConceptIds: ["trim_basics"],
                targetObjectiveIds: ["obj_1"],
                template: "To remove leading and trailing spaces from text, a common SQL function is ____.",
                choices: ["TRIM", "COUNT", "GROUP BY", "ORDER BY"],
                correct: "TRIM",
            }),
        ],
    };
}

function buildExpressionsRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches = makeDefaultSketches(topicPlan, goals);

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makePractice({
                id: "practice_sql",
                title: `Practice: ${topicPlan.title}`,
                prompt:
                    "The `products` table already exists.\n\nWrite a query that shows `name`, `price`, and a calculated column named `price_with_tax` that multiplies `price` by `1.1`.\n\nThen run it.",
                datasetId: "products_catalog",
                starterCode:
                    "-- Show a calculated column\nSELECT name, price, price * 1.1 AS price_with_tax\nFROM products\n",
                solutionCode:
                    "SELECT name, price, price * 1.1 AS price_with_tax FROM products;",
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview", "goal_one"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                hint: "Use an expression in SELECT and give it an alias.",
                hint1: "You can multiply a numeric column directly in the SELECT list.",
                hint2: "Use AS price_with_tax.",
            }),
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It uses expressions in SELECT to create calculated output values.",
                    b: "It deletes rows before selecting them.",
                    c: "It only renames tables permanently.",
                    d: "It only changes database schema.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one", "goal_two"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "You can compute new values directly in SELECT.",
                    b: "You can give a calculated expression an alias.",
                    c: "Calculated columns require deleting the original column first.",
                    d: "Calculated columns only work in UPDATE statements.",
                    e: "Expressions in SELECT help you inspect transformed output.",
                },
                correct: ["a", "b", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Decide what to calculate, write the expression, then inspect the output.",
                targetConceptIds: ["goal_one", "practice_note"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "identify the value you want to calculate",
                    t2: "write the expression in the SELECT list",
                    t3: "run the query and inspect the calculated output",
                },
            }),
            makeFillBlank({
                id: "keyword_fill",
                title: "Expression location",
                prompt: "Fill in the blank with the best SQL keyword.",
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one"],
                targetObjectiveIds: ["obj_1"],
                template: "A calculated expression in a query is commonly written in the ____ list.",
                choices: ["SELECT", "DELETE", "GROUP", "TABLE"],
                correct: "SELECT",
            }),
        ],
    };
}

function buildAggregateRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches = makeDefaultSketches(topicPlan, goals);

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makePractice({
                id: "practice_sql",
                title: `Practice: ${topicPlan.title}`,
                prompt:
                    "The `products` table already exists.\n\nWrite a query that returns the number of rows and the average price.\n\nThen run it.",
                datasetId: "products_catalog",
                starterCode:
                    "-- Summarize the table\nSELECT COUNT(*) AS product_count, AVG(price) AS avg_price\nFROM products\n",
                solutionCode:
                    "SELECT COUNT(*) AS product_count, AVG(price) AS avg_price FROM products;",
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview", "goal_one"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                hint: "Use aggregate functions in the SELECT list.",
                hint1: "COUNT(*) gives the number of rows.",
                hint2: "AVG(price) gives the average price.",
            }),
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It summarizes many rows into a smaller business answer.",
                    b: "It only renames columns.",
                    c: "It permanently edits stored values.",
                    d: "It only works with joins.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one", "goal_two"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "COUNT can summarize the number of rows.",
                    b: "AVG can summarize numeric values.",
                    c: "SUM, MIN, and MAX are aggregate functions.",
                    d: "Aggregates only work after DELETE.",
                    e: "Aggregates help produce report-style summaries.",
                },
                correct: ["a", "b", "c", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Choose the summary you want, write the matching aggregate, then interpret the output.",
                targetConceptIds: ["goal_one", "practice_note"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "decide what summary value you need",
                    t2: "choose the matching aggregate function",
                    t3: "run the query and interpret the summary output",
                },
            }),
            makeFillBlank({
                id: "keyword_fill",
                title: "Aggregate function",
                prompt: "Fill in the blank with the best SQL function.",
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one"],
                targetObjectiveIds: ["obj_1"],
                template: "To count all rows in a table, a common SQL function is ____.",
                choices: ["COUNT", "TABLE", "ALTER", "GROUP"],
                correct: "COUNT",
            }),
        ],
    };
}

function buildGroupByRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches = makeDefaultSketches(topicPlan, goals);

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makePractice({
                id: "practice_sql",
                title: `Practice: ${topicPlan.title}`,
                prompt:
                    "The `products` table already exists.\n\nWrite a query that shows each `category` and the number of products in that category.\n\nThen run it.",
                datasetId: "products_catalog",
                starterCode:
                    "-- Count rows per category\nSELECT category, COUNT(*) AS product_count\nFROM products\nGROUP BY category\n",
                solutionCode:
                    "SELECT category, COUNT(*) AS product_count FROM products GROUP BY category;",
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview", "goal_one"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                hint: "Select the grouping column and an aggregate together.",
                hint1: "Use COUNT(*) with category.",
                hint2: "Add GROUP BY category.",
            }),
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It summarizes data by category, person, team, or other groups.",
                    b: "It only sorts output alphabetically.",
                    c: "It is only for table design.",
                    d: "It deletes grouped rows from storage.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one", "goal_two"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "GROUP BY creates one summary row per group.",
                    b: "HAVING filters groups after grouping.",
                    c: "WHERE and HAVING always mean the same thing.",
                    d: "A grouped query often includes aggregates.",
                    e: "Grouping can make result sets shorter than the original table.",
                },
                correct: ["a", "b", "d", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Choose the grouping column, choose the summary, then inspect the grouped result.",
                targetConceptIds: ["goal_one", "practice_note"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "choose the column that defines the groups",
                    t2: "add the aggregate that summarizes each group",
                    t3: "run the query and interpret the grouped result",
                },
            }),
            makeFillBlank({
                id: "keyword_fill",
                title: "Grouping clause",
                prompt: "Fill in the blank with the best SQL phrase.",
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one"],
                targetObjectiveIds: ["obj_1"],
                template: "The SQL clause used to group rows before aggregation is ____.",
                choices: ["GROUP BY", "ORDER BY", "DELETE", "VALUES"],
                correct: "GROUP BY",
            }),
        ],
    };
}

function buildJoinRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches = makeDefaultSketches(topicPlan, goals);

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: "It connects related information stored across different tables.",
                    b: "It only sorts one table alphabetically.",
                    c: "It permanently merges all tables into one.",
                    d: "It is only for text cleanup.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one", "goal_two"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: "Keys help define how tables connect.",
                    b: "INNER JOIN returns only matching rows.",
                    c: "LEFT JOIN can keep unmatched rows from the left table.",
                    d: "Joins are unrelated to foreign keys.",
                    e: "NULL values can appear in some left-joined results.",
                },
                correct: ["a", "b", "c", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Identify the relationship, match the key columns, then inspect the joined result.",
                targetConceptIds: ["goal_one", "practice_note"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "identify which tables are related",
                    t2: "match the key columns in the join condition",
                    t3: "run the query and inspect the combined result",
                },
            }),
        ],
    };
}

function buildDefaultRecipe(topicPlan: TopicPlanDraft, goals: string[]): SqlTopicRecipe {
    const objectives = makeObjectives(goals);
    const sketches = makeDefaultSketches(topicPlan, goals);

    return {
        topicId: topicPlan.topicId,
        title: topicPlan.title,
        summary: topicPlan.summary,
        minutes: topicPlan.minutes,
        objectives,
        sketches,
        exercises: [
            makeSingleChoice({
                id: "core_concept",
                title: `Core idea: ${topicPlan.title}`,
                prompt: `What is the best description of ${topicPlan.title}?`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["concept_overview"],
                targetObjectiveIds: ["obj_1"],
                options: {
                    a: topicPlan.summary,
                    b: "It permanently removes columns from a table.",
                    c: "It only changes schema metadata.",
                    d: "It always requires aggregation.",
                },
                correct: "a",
            }),
            makeMultiChoice({
                id: "true_statements",
                title: `True statements about ${topicPlan.title}`,
                prompt: `Select all true statements about ${topicPlan.title}.`,
                conceptText: topicPlan.summary,
                targetConceptIds: ["goal_one", "goal_two"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                options: {
                    a: topicPlan.summary,
                    b: goals[0],
                    c: "It is unrelated to retrieving data from tables.",
                    d: "It only works after deleting rows.",
                    e: goals[1],
                },
                correct: ["a", "b", "e"],
            }),
            makeReorder({
                id: "workflow_order",
                title: `Workflow for ${topicPlan.title}`,
                prompt: `Reorder the workflow ideas for ${topicPlan.title}.`,
                conceptText: "Understand the requirement, write the SQL, then verify the result.",
                targetConceptIds: ["practice_note"],
                targetObjectiveIds: ["obj_1", "obj_2"],
                tokens: {
                    t1: "read the requirement for the data you want",
                    t2: "write the SQL that matches that requirement",
                    t3: "run the query and verify the output",
                },
            }),
        ],
    };
}

export function inferSqlTopicRecipe(topicPlan: TopicPlanDraft): SqlTopicRecipe {
    const text = normalize(`${topicPlan.topicId} ${topicPlan.title} ${topicPlan.summary}`);
    const goals = ensureGoals(topicPlan);

    if (isOrientationTopic(text)) return buildOrientationRecipe(topicPlan, goals);
    if (isSelectingColumnsTopic(text)) return buildSelectingColumnsRecipe(topicPlan, goals);
    if (isFilteringTopic(text)) return buildFilteringRecipe(topicPlan, goals);
    if (isSortingTopic(text)) return buildSortingRecipe(topicPlan, goals);
    if (isCleanupTopic(text)) return buildCleanupRecipe(topicPlan, goals);
    if (isTextNullTopic(text)) return buildTextNullRecipe(topicPlan, goals);
    if (isExpressionsTopic(text)) return buildExpressionsRecipe(topicPlan, goals);
    if (isAggregateTopic(text)) return buildAggregateRecipe(topicPlan, goals);
    if (isGroupByTopic(text)) return buildGroupByRecipe(topicPlan, goals);
    if (isJoinTopic(text)) return buildJoinRecipe(topicPlan, goals);

    return buildDefaultRecipe(topicPlan, goals);
}