export function buildCppPlan(entry?: string) {
    return {
        compile: {
            command: "bash",
            args: ["-lc", 'mkdir -p build && FILES=$(find . -name "*.cpp" -not -path "./build/*") && g++ -O2 -std=c++17 -I. -o build/app $FILES'],
        },
        run: {
            command: "bash",
            args: ["-lc", "./build/app"],
        },
    };
}