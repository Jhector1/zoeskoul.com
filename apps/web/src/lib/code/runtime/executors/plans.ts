import type { InteractiveLanguage } from "../../types/common";

export type CommandPlan = {
    command: string;
    args: string[];
};

export type ExecutionPlan = {
    compile?: CommandPlan;
    run: CommandPlan;
};

export function getExecutionPlan(
    language: InteractiveLanguage,
    entryFile: string,
): ExecutionPlan {
    switch (language) {
        case "python":
            return {
                run: {
                    command: "python3",
                    args: [entryFile],
                },
            };

        case "javascript":
            return {
                run: {
                    command: "node",
                    args: [entryFile],
                },
            };

        case "c":
            return {
                compile: {
                    command: "bash",
                    args: [
                        "-lc",
                        [
                            "set -euo pipefail",
                            "mkdir -p build",
                            `INCLUDES="$(find . -type f \\( -name '*.h' \\) -not -path './build/*' -print0 | xargs -0 -n1 dirname | sort -u | sed 's#^#-I#' | tr '\\n' ' ')"`,
                            `SRCS="$(find . -type f \\( -name '*.c' \\) -not -path './build/*' -print0 | xargs -0 printf '%s ')"`,
                            `echo "PWD=$(pwd)"`,
                            `echo "INCLUDES=$INCLUDES"`,
                            `echo "SRCS=$SRCS"`,
                            `gcc -O2 -std=c11 $INCLUDES -o build/app $SRCS`,
                        ].join(" && "),
                    ],
                },
                run: {
                    command: "bash",
                    args: ["-lc", "./build/app"],
                },
            };

        case "cpp":
            return {
                compile: {
                    command: "bash",
                    args: [
                        "-lc",
                        [
                            "set -euo pipefail",
                            "mkdir -p build",
                            `INCLUDES="$(find . -type f \\( -name '*.h' -o -name '*.hpp' -o -name '*.hh' \\) -not -path './build/*' -print0 | xargs -0 -n1 dirname | sort -u | sed 's#^#-I#' | tr '\\n' ' ')"`,
                            `SRCS="$(find . -type f \\( -name '*.cpp' -o -name '*.cc' -o -name '*.cxx' \\) -not -path './build/*' -print0 | xargs -0 printf '%s ')"`,
                            `echo "PWD=$(pwd)"`,
                            `echo "INCLUDES=$INCLUDES"`,
                            `echo "SRCS=$SRCS"`,
                            `g++ -O2 -std=c++17 $INCLUDES -o build/app $SRCS`,
                        ].join(" && "),
                    ],
                },
                run: {
                    command: "bash",
                    args: ["-lc", "./build/app"],
                },
            };

        case "java":
            return {
                compile: {
                    command: "bash",
                    args: [
                        "-lc",
                        [
                            "set -euo pipefail",
                            "mkdir -p build",
                            `SRCS="$(find . -type f -name '*.java' -not -path './build/*' -print0 | xargs -0 printf '%s ')"`,
                            `echo "PWD=$(pwd)"`,
                            `echo "SRCS=$SRCS"`,
                            `javac -d build $SRCS`,
                        ].join(" && "),
                    ],
                },
                run: {
                    command: "java",
                    args: ["-cp", "build", inferJavaMainClass(entryFile)],
                },
            };
    }
}

function inferJavaMainClass(entryFile: string) {
    const normalized = entryFile.replace(/\\/g, "/");
    const noExt = normalized.replace(/\.java$/, "");
    return noExt.split("/").join(".");
}