import type { InteractiveLanguage, FileEntry } from "@zoeskoul/code-contracts";

export type ExecutionPlan = {
    compileCmd?: string;
    runCmd: string;
};

function getJavaMainClass(files: FileEntry[], entryFile: string): string {
    const normalizedEntry = entryFile.replace(/\\/g, "/");
    const simpleName =
        normalizedEntry.split("/").pop()?.replace(/\.java$/, "") || "Main";

    const entrySource =
        files.find((f) => f.path.replace(/\\/g, "/") === normalizedEntry)?.content ?? "";

    const pkgMatch = entrySource.match(
        /^\s*package\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*;/m,
    );

    if (pkgMatch?.[1]) {
        return `${pkgMatch[1]}.${simpleName}`;
    }

    return simpleName;
}

export function getExecutionPlan(
    language: InteractiveLanguage,
    entryFile: string,
    files: FileEntry[] = [],
): ExecutionPlan {
    switch (language) {
        case "python":
            return {
                runCmd: `python3 -u '${entryFile}'`,
            };

        case "javascript":
            return {
                runCmd: `node '${entryFile}'`,
            };

        case "c":
            return {
                compileCmd: [
                    "set -euo pipefail",
                    "mkdir -p build",
                    `INCLUDES="$(find . -type f \\( -name '*.h' \\) -not -path './build/*' -print0 | xargs -0 -r -n1 dirname | sort -u | sed 's#^#-I#' | tr '\\n' ' ')"`,
                    `SRCS="$(find . -type f \\( -name '*.c' \\) -not -path './build/*' -print0 | xargs -0 -r printf '%s ')"`,
                    `[ -n "$SRCS" ]`,
                    `gcc -O2 -std=c11 $INCLUDES -o build/app $SRCS`,
                ].join(" && "),
                runCmd: "./build/app",
            };

        case "cpp":
            return {
                compileCmd: [
                    "set -euo pipefail",
                    "mkdir -p build",
                    `INCLUDES="$(find . -type f \\( -name '*.h' -o -name '*.hpp' -o -name '*.hh' \\) -not -path './build/*' -print0 | xargs -0 -r -n1 dirname | sort -u | sed 's#^#-I#' | tr '\\n' ' ')"`,
                    `SRCS="$(find . -type f \\( -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' \\) -not -path './build/*' -print0 | xargs -0 -r printf '%s ')"`,
                    `[ -n "$SRCS" ]`,
                    `g++ -O2 -std=c++17 $INCLUDES -o build/app $SRCS`,
                ].join(" && "),
                runCmd: "./build/app",
            };

        case "java": {
            const mainClass = getJavaMainClass(files, entryFile);
            console.log({
                entryFile,
                filePaths: files.map((f) => f.path),
                mainClass,
            });
            return {
                compileCmd: [
                    "set -euo pipefail",
                    "mkdir -p build",
                    `SRCS="$(find . -type f -name '*.java' -not -path './build/*' -print0 | xargs -0 -r printf '%s ')"`,
                    `[ -n "$SRCS" ]`,
                    `javac -d build $SRCS`,
                ].join(" && "),
                runCmd: `java -cp build ${mainClass}`,
            };
        }
    }
}