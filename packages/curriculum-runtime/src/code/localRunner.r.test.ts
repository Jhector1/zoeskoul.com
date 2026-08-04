import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { runLocalCode } from "./localRunner.js";

const hasRscript =
    spawnSync("Rscript", ["--version"], { encoding: "utf8" }).status === 0;

describe("local R runner", () => {
    it.skipIf(!hasRscript)(
        "executes base R with stdin and preserves stdout",
        async () => {
            const result = await runLocalCode({
                language: "r",
                code: [
                    'value <- as.numeric(readLines("stdin", n = 1))',
                    'cat(value * 2, "\\n")',
                ].join("\n"),
                stdin: "5\n",
            });

            expect(result).toMatchObject({
                ok: true,
                exitCode: 0,
                stdout: "10 \n",
            });
        },
    );
});
