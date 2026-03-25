import type { InteractiveLanguage } from "@zoeskoul/code-contracts";

export type ExecutionPlan = {
    compileCmd?: string;
    runCmd: string;
};

export function getExecutionPlan(
    language: InteractiveLanguage,
    entryFile: string,
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
                    `INCLUDES="$(find . -type f \\( -name '*.h' \\) -not -path './build/*' -print0 | xargs -0 -n1 dirname | sort -u | sed 's#^#-I#' | tr '\\n' ' ')"`,
                    `SRCS="$(find . -type f \\( -name '*.c' \\) -not -path './build/*' -print0 | xargs -0 printf '%s ')"`,
                    `gcc -O2 -std=c11 $INCLUDES -o build/app $SRCS`,
                ].join(" && "),
                runCmd: "./build/app",
            };

        case "cpp":
            return {
                compileCmd: [
                    "set -euo pipefail",
                    "mkdir -p build",
                    `INCLUDES="$(find . -type f \\( -name '*.h' -o -name '*.hpp' -o -name '*.hh' \\) -not -path './build/*' -print0 | xargs -0 -n1 dirname | sort -u | sed 's#^#-I#' | tr '\\n' ' ')"`,
                    `SRCS="$(find . -type f \\( -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' \\) -not -path './build/*' -print0 | xargs -0 printf '%s ')"`,
                    `g++ -O2 -std=c++17 $INCLUDES -o build/app $SRCS`,
                ].join(" && "),
                runCmd: "./build/app",
            };

        case "java": {
            const mainClass = entryFile
                .replace(/\\/g, "/")
                .replace(/\.java$/, "")
                .split("/")
                .join(".");

            return {
                compileCmd: [
                    "set -euo pipefail",
                    "mkdir -p build",
                    `SRCS="$(find . -type f -name '*.java' -not -path './build/*' -print0 | xargs -0 printf '%s ')"`,
                    `javac -d build $SRCS`,
                ].join(" && "),
                runCmd: `java -cp build '${mainClass}'`,
            };
        }
    }
}