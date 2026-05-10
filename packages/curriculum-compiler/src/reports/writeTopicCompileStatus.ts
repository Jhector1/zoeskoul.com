import fs from "node:fs/promises";
import path from "node:path";

export async function writeTopicCompileStatus(args: {
    reportDir: string;
    status: "success" | "failed";
    attempts: number;
    finalAttempt: number;
    errorCode?: string;
    errorMessage?: string;
}) {
    await fs.mkdir(args.reportDir, { recursive: true });

    await fs.writeFile(
        path.join(args.reportDir, "compile-status.json"),
        JSON.stringify(args, null, 2),
    );
}
