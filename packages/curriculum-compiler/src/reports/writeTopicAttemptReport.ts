import fs from "node:fs/promises";
import path from "node:path";

function errorToJson(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: (error as any).code,
            retryable: (error as any).retryable === true,
            details: (error as any).details,
        };
    }

    return {
        name: "NonError",
        message: String(error),
        retryable: false,
    };
}

export async function writeTopicAttemptReport(args: {
    reportDir: string;
    attempt: number;
    status: "failed" | "success";
    prompt?: {
        system: string;
        user: string;
    };
    rawModelOutput?: string;
    parsedOutput?: unknown;
    rawDraft?: unknown;
    normalizedDraft?: unknown;
    repairedDraft?: unknown;
    validationResult?: unknown;
    attemptMetadata?: unknown;
    hashes?: unknown;
    repairReport?: unknown;
    critiqueReport?: unknown;
    semanticReport?: unknown;
    goldenReport?: unknown;
    topicBundle?: unknown;
    error?: unknown;
}) {
    const dir = path.join(args.reportDir, `attempt-${args.attempt}`);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(
        path.join(dir, "attempt-status.json"),
        JSON.stringify(
            {
                attempt: args.attempt,
                status: args.status,
                retryable:
                    args.error &&
                    typeof args.error === "object" &&
                    (args.error as any).retryable === true,
                errorCode:
                    args.error &&
                    typeof args.error === "object"
                        ? (args.error as any).code
                        : undefined,
            },
            null,
            2,
        ),
    );

    const writes: Array<[string, unknown]> = [
        ["prompt.json", args.prompt],
        ["raw-model-output.txt", args.rawModelOutput],
        ["parsed-output.json", args.parsedOutput],
        ["raw-draft.json", args.rawDraft],
        ["normalized-draft.json", args.normalizedDraft],
        ["repaired-draft.json", args.repairedDraft],
        ["validation-result.json", args.validationResult],
        ["attempt-metadata.json", args.attemptMetadata],
        ["hashes.json", args.hashes],
        ["repair-report.json", args.repairReport],
        ["critique-report.json", args.critiqueReport],
        ["semantic-report.json", args.semanticReport],
        ["golden-report.json", args.goldenReport],
        ["emitted-topic-bundle.json", args.topicBundle],
        ["error.json", args.error ? errorToJson(args.error) : undefined],
    ];

    for (const [filename, value] of writes) {
        if (value === undefined) continue;

        await fs.writeFile(path.join(dir, filename), typeof value === "string"
            ? value
            : JSON.stringify(value, null, 2));
    }
}
