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
        "java",
        "javascript",
        "typescript",
        "c",
        "cpp",
        "sql",
        "bash",
    ]);

    return { codeEnabled: PROGRAMMING.has(subjectSlug) };
}