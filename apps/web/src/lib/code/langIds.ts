import { CodeLanguage } from "@/lib/practice/types";

type Judge0Language = Exclude<CodeLanguage, "sql">;

function envInt(name: string) {
    const v = process.env[name];
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

const FALLBACK_LANG_IDS: Record<Judge0Language, number> = {
    python: 71,
    java: 62,
    javascript: 63,
    c: 50,
    cpp: 54,
};

export function getSingleFileLanguageId(lang: Judge0Language) {
    const py = envInt("JUDGE0_LANG_PYTHON");
    const ja = envInt("JUDGE0_LANG_JAVA");
    const js = envInt("JUDGE0_LANG_JAVASCRIPT");
    const c = envInt("JUDGE0_LANG_C");
    const cpp = envInt("JUDGE0_LANG_CPP");

    if (lang === "python" && py) return py;
    if (lang === "java" && ja) return ja;
    if (lang === "javascript" && js) return js;
    if (lang === "c" && c) return c;
    if (lang === "cpp" && cpp) return cpp;

    return FALLBACK_LANG_IDS[lang];
}