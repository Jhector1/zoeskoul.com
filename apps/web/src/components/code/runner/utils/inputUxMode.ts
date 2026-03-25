import type { CodeLanguage } from "@/lib/practice/types";

export type InputUxMode = "probe" | "guided" | "stdin";

function firstInputIndex(lang: CodeLanguage, code: string) {
    const src = String(code ?? "");

    if (lang === "python") {
        const i = src.search(/\b(?:builtins\.)?input\s*\(/);
        return i >= 0 ? i : src.length;
    }

    if (lang === "java") {
        const i = src.search(
            /\.\s*next(?:\s*\(|Line\s*\(|Int\s*\(|Long\s*\(|Double\s*\(|Float\s*\(|Boolean\s*\(|Short\s*\(|Byte\s*\()/,
        );
        return i >= 0 ? i : src.length;
    }

    if (lang === "c") {
        const i = src.search(/\bscanf\s*\(|\bgets\s*\(|\bfgets\s*\(/);
        return i >= 0 ? i : src.length;
    }

    if (lang === "cpp") {
        const i = src.search(/\b(?:std::)?cin\s*>>|\bgetline\s*\(/);
        return i >= 0 ? i : src.length;
    }

    return src.length;
}

export function pickInputUxMode(lang: CodeLanguage, code: string): InputUxMode {
    if (lang === "python") return "probe";
    if (lang === "sql") return "guided";

    if (lang !== "java" && lang !== "c" && lang !== "cpp") {
        return "guided";
    }

    const src = String(code ?? "");
    const pre = src.slice(0, firstInputIndex(lang, src));

    const projectMarkers =
        /#include\s+"|ifstream|ofstream|fstream|loadFromFile|printAllStudents|printStudentByIndex|class\s+\w+|new\s+\w+\(|\bRoster\b/.test(
            src,
        );

    const dynamicPreInputOutput =
        lang === "cpp"
            ? /<<\s*[A-Za-z_]\w*|<<\s*\w+\.\w+\(|\b[A-Za-z_]\w*\s*\([^;]*\)\s*;/.test(pre)
            : lang === "c"
                ? /\bprintf\s*\(\s*[^"]|\b[A-Za-z_]\w*\s*\([^;]*\)\s*;/.test(pre)
                : /\bSystem\.out\.(?:print|println)\(\s*[^"]|\b[A-Za-z_]\w*\s*\([^;]*\)\s*;/.test(pre);

    return projectMarkers || dynamicPreInputOutput ? "stdin" : "guided";
}