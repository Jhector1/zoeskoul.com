// import type { ToolId } from "@/components/tools/types";
//
// /**
//  * Long-term: store this in PracticeSubject.meta
//  * e.g. meta.tools = { codeEnabled: true }
//  */
// const PROGRAMMING_SUBJECTS = new Set([
//     "python",
//     "java",
//     "javascript",
//     "c",
//     "cpp",
// ]);
//
// export function toolsPolicyForSubject(subjectSlug: string, meta?: any): {
//     codeEnabled: boolean;
//     defaultTool: ToolId;
// } {
//     const codeEnabled =
//         Boolean(meta?.tools?.codeEnabled) ||
//         PROGRAMMING_SUBJECTS.has(subjectSlug);
//
//     return {
//         codeEnabled,
//         defaultTool: codeEnabled ? "code" : "notes",
//     };
// }

export function toolsPolicyForSubject(subjectSlug: string, meta?: any) {
    // Long-term: prefer meta.tools.codeEnabled if you add it to PracticeSubject.meta
    const metaEnabled = meta?.tools?.codeEnabled;
    if (typeof metaEnabled === "boolean") {
        return { codeEnabled: metaEnabled };
    }

    // Default heuristics (edit freely)
    const PROGRAMMING = new Set([
        "python",
        "python-for-beginners",
        "java",
        "javascript",
        "typescript",
        "c",
        "cpp",
        "sql",
        "bash",
    ]);

    const slug = String(subjectSlug ?? "").trim().toLowerCase();
    const codeEnabled =
        PROGRAMMING.has(slug) ||
        slug.startsWith("python-") ||
        slug.startsWith("java-") ||
        slug.startsWith("javascript-") ||
        slug.startsWith("typescript-") ||
        slug.startsWith("sql-") ||
        slug.startsWith("c-") ||
        slug.startsWith("cpp-") ||
        slug.startsWith("bash-");

    return { codeEnabled };
}
