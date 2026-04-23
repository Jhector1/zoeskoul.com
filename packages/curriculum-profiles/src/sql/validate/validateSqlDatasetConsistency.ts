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
        ...sql.matchAll(/\binto\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi),
    ];

    return [...new Set(matches.map((m) => m[1]))];
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

    for (const block of args.draft.sketchBlocks) {
        const sqlBlocks = extractSqlCodeBlocks(block.bodyMarkdown);

        for (const sql of sqlBlocks) {
            const tables = extractReferencedTables(sql);

            for (const table of tables) {
                if (!allowedTables.has(table)) {
                    issues.push(
                        `Sketch ${block.id} references table "${table}" outside module dataset "${datasetId}"`,
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
    }

    return issues;
}