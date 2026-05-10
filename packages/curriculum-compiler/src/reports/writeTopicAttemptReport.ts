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
    rawDraft?: unknown;
    repairedDraft?: unknown;
    repairReport?: unknown;
    critiqueReport?: unknown;
    semanticReport?: unknown;
    goldenReport?: unknown;
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
        ["raw-draft.json", args.rawDraft],
        ["repaired-draft.json", args.repairedDraft],
        ["repair-report.json", args.repairReport],
        ["critique-report.json", args.critiqueReport],
        ["semantic-report.json", args.semanticReport],
        ["golden-report.json", args.goldenReport],
        ["error.json", args.error ? errorToJson(args.error) : undefined],
    ];

    for (const [filename, value] of writes) {
        if (value === undefined) continue;

        await fs.writeFile(
            path.join(dir, filename),
            JSON.stringify(value, null, 2),
        );
    }
}