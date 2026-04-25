import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";

function extractSqlCodeBlocks(markdown: string): string[] {
    const matches = markdown.match(/~~~sql\s*([\s\S]*?)~~~/gi) ?? [];
    return matches.map((block) =>
        block.replace(/^~~~sql\s*/i, "").replace(/~~~$/i, "").trim(),
    );
}

function extractReferencedTables(sql: string): string[] {
    const matches = [
        ...sql.matchAll(/\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
        ...sql.matchAll(/\bjoin\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
        ...sql.matchAll(/\bupdate\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
        ...sql.matchAll(/\binsert\s+into\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
        ...sql.matchAll(/\bdelete\s+from\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
    ];

    return [...new Set(matches.map((m) => m[1]))];
}

function extractReferencedColumns(sql: string): string[] {
    const matches = [
        ...sql.matchAll(/\bselect\s+([\s\S]*?)\bfrom\b/gi),
        ...sql.matchAll(/\bwhere\s+([\s\S]*?)(?:\bgroup\b|\border\b|\bhaving\b|\blimit\b|$)/gi),
    ];

    const identifiers = new Set<string>();

    for (const match of matches) {
        const text = match[1] ?? "";
        for (const id of text.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)) {
            const value = id[1];
            if (
                value &&
                ![
                    "select",
                    "from",
                    "where",
                    "and",
                    "or",
                    "as",
                    "count",
                    "sum",
                    "avg",
                    "min",
                    "max",
                    "distinct",
                    "group",
                    "by",
                    "order",
                    "having",
                    "limit",
                    "asc",
                    "desc",
                ].includes(value.toLowerCase())
            ) {
                identifiers.add(value);
            }
        }
    }

    return [...identifiers];
}

export function validateSqlDatasetConsistency(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): string[] {
    const issues: string[] = [];

    const datasetId =
        args.seed.moduleRuntimeDefaults?.kind === "sql"
            ? args.seed.moduleRuntimeDefaults.datasetId
            : undefined;

    const dataset = args.seed.moduleDataset;

    if (!datasetId || !dataset) return issues;

    const allowedTables = new Set(Object.keys(dataset.tableSnapshots));
    const allowedColumns = new Set(
        Object.values(dataset.tableSnapshots).flatMap((table: any) =>
            Array.isArray(table?.columns) ? table.columns.map((c: any) => c.name) : [],
        ),
    );

    for (const block of args.draft.sketchBlocks) {
        const sqlBlocks = extractSqlCodeBlocks(block.bodyMarkdown);

        for (const sql of sqlBlocks) {
            const tables = extractReferencedTables(sql);
            const columns = extractReferencedColumns(sql);

            for (const table of tables) {
                if (!allowedTables.has(table)) {
                    issues.push(
                        `Sketch ${block.id} references table "${table}" outside module dataset "${datasetId}"`,
                    );
                }
            }

            for (const column of columns) {
                if (!allowedColumns.has(column) && !allowedTables.has(column)) {
                    issues.push(
                        `Sketch ${block.id} references column "${column}" that does not belong to module dataset "${datasetId}"`,
                    );
                }
            }
        }
    }

    for (const ex of args.draft.quizDraft) {
        if (ex.kind !== "code_input") continue;

        const datasetUsed: string | undefined = ex.datasetId ?? datasetId;
        if (datasetUsed !== datasetId) {
            issues.push(
                `Exercise ${ex.id} uses dataset "${datasetUsed}" but module dataset is "${datasetId}"`,
            );
        }

        const sqlTexts = [ex.starterCode, ex.solutionCode].filter(Boolean);

        for (const sql of sqlTexts) {
            const tables = extractReferencedTables(sql);
            const columns = extractReferencedColumns(sql);

            for (const table of tables) {
                if (!allowedTables.has(table)) {
                    issues.push(
                        `Exercise ${ex.id} references table "${table}" outside module dataset "${datasetId}"`,
                    );
                }
            }

            for (const column of columns) {
                if (!allowedColumns.has(column) && !allowedTables.has(column)) {
                    issues.push(
                        `Exercise ${ex.id} references column "${column}" that does not belong to module dataset "${datasetId}"`,
                    );
                }
            }
        }
    }

    return issues;
}