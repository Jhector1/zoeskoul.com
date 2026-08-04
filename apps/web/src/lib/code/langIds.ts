import type { InteractiveLanguage } from "@zoeskoul/code-contracts";

// Keep bash out of single-file Judge0 language ids for now. Course 1 shell labs
// grade via terminal workspace snapshots, and any future bash execution should
// go through PTY/project mode intentionally rather than this single-file path.
type Judge0Language = Exclude<InteractiveLanguage, "bash">;

function envInt(name: string) {
    const v = process.env[name];
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

const FALLBACK_LANG_IDS: Partial<Record<Judge0Language, number>> = {
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
    const r = envInt("JUDGE0_LANG_R");
    const c = envInt("JUDGE0_LANG_C");
    const cpp = envInt("JUDGE0_LANG_CPP");

    if (lang === "python" && py) return py;
    if (lang === "java" && ja) return ja;
    if (lang === "javascript" && js) return js;
    if (lang === "r" && r) return r;
    if (lang === "c" && c) return c;
    if (lang === "cpp" && cpp) return cpp;

    const fallback = FALLBACK_LANG_IDS[lang];
    if (fallback) return fallback;

    if (lang === "r") {
        throw new Error(
            "R is not configured for Judge0. Set JUDGE0_LANG_R to the verified R language ID.",
        );
    }

    throw new Error(`Unsupported Judge0 language: ${lang}`);
}
