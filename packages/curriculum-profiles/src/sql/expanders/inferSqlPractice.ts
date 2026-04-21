import type { TopicPlanDraft } from "@zoeskoul/curriculum-contracts";

export type SqlPracticeSpec = {
    datasetId: string;
    starterCode: string;
    solutionCode: string;
    prompt: string;
    hint: string;
    hint1: string;
    hint2: string;
};

export function inferSqlPractice(topicPlan: TopicPlanDraft): SqlPracticeSpec {
    const id = topicPlan.topicId.toLowerCase();
    const title = topicPlan.title.toLowerCase();

    if (id.includes("group_by") || title.includes("group by")) {
        return {
            datasetId: "products_catalog",
            starterCode:
                "-- Group products by category and count rows\nSELECT category, COUNT(*) AS count_rows\nFROM products\n",
            solutionCode:
                "SELECT category, COUNT(*) AS count_rows FROM products GROUP BY category;",
            prompt:
                "The `products` table already exists.\n\nWrite a query that shows each `category` and the count of rows in that category.\n\nThen run it.",
            hint: "Use GROUP BY on category and COUNT(*).",
            hint1: "Select the grouping column and an aggregate.",
            hint2: "Use `GROUP BY category` after counting the rows.",
        };
    }

    if (
        id.includes("count") ||
        id.includes("sum") ||
        id.includes("avg") ||
        id.includes("min") ||
        id.includes("max") ||
        title.includes("count") ||
        title.includes("sum") ||
        title.includes("avg") ||
        title.includes("min") ||
        title.includes("max")
    ) {
        return {
            datasetId: "products_catalog",
            starterCode:
                "-- Show summary values for product prices\nSELECT COUNT(*) AS product_count, AVG(price) AS avg_price\nFROM products\n",
            solutionCode:
                "SELECT COUNT(*) AS product_count, AVG(price) AS avg_price FROM products;",
            prompt:
                "The `products` table already exists.\n\nWrite a query that returns the number of products and the average price.\n\nThen run it.",
            hint: "Use COUNT(*) and AVG(price).",
            hint1: "Use aggregate functions in the SELECT list.",
            hint2: "You do not need GROUP BY for a full-table summary.",
        };
    }

    if (
        id.includes("comparison") ||
        id.includes("where") ||
        id.includes("filter") ||
        title.includes("comparison") ||
        title.includes("filter")
    ) {
        return {
            datasetId: "products_catalog",
            starterCode:
                "-- Show products priced above 50\nSELECT name, price\nFROM products\nWHERE price > 50\n",
            solutionCode:
                "SELECT name, price FROM products WHERE price > 50;",
            prompt:
                "The `products` table already exists.\n\nWrite a query that shows the `name` and `price` columns for products whose `price` is greater than `50`.\n\nThen run it.",
            hint: "Use a WHERE clause with `price > 50`.",
            hint1: "Select only the columns you need before filtering.",
            hint2: "Use a comparison operator in the WHERE clause.",
        };
    }

    if (
        id.includes("like") ||
        id.includes("text") ||
        id.includes("string") ||
        id.includes("case_insensitivity") ||
        title.includes("like") ||
        title.includes("text") ||
        title.includes("string")
    ) {
        return {
            datasetId: "products_catalog",
            starterCode:
                "-- Show products whose name contains 'a'\nSELECT name\nFROM products\nWHERE LOWER(name) LIKE '%a%'\n",
            solutionCode:
                "SELECT name FROM products WHERE LOWER(name) LIKE '%a%';",
            prompt:
                "The `products` table already exists.\n\nWrite a query that shows the `name` column for products whose name contains the letter `a`, ignoring case.\n\nThen run it.",
            hint: "Use `LOWER(name)` with `LIKE`.",
            hint1: "Make both sides comparable for case-insensitive matching.",
            hint2: "Use a wildcard pattern like `%a%`.",
        };
    }

    return {
        datasetId: "products_catalog",
        starterCode:
            "-- Show a few product rows\nSELECT id, name, price\nFROM products\nLIMIT 5\n",
        solutionCode:
            "SELECT id, name, price FROM products LIMIT 5;",
        prompt:
            "The `products` table already exists.\n\nWrite a query that shows the `id`, `name`, and `price` columns for five rows.\n\nThen run it.",
        hint: "Select three columns and limit the output.",
        hint1: "Use SELECT for the columns you want to inspect.",
        hint2: "Use LIMIT 5 to keep the output small.",
    };
}