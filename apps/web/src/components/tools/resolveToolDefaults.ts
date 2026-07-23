import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { DEFAULT_SQL_DIALECT } from "@/components/code/runner/constants";
import { defaultMainCode } from "@/components/ide/languageDefaults";
import { resolveCourseLanguage } from "@/components/review/module/runtime/courseProfiles";

export type ToolDefaults = {
    defaultLang: WorkspaceLanguage;
    defaultCode: string;
    defaultStdin: string;
    defaultSqlDialect: SqlDialect;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * One language-driven fallback for every course profile.
 *
 * Course/profile metadata decides the language. The shared IDE language
 * defaults decide the entry-file content. This keeps SQL, Python, C, Java,
 * JavaScript, C++, Bash, Web, and future language profiles on the same path.
 */
export function toolDefaultsForLanguage(
    language: WorkspaceLanguage,
): ToolDefaults {
    return {
        defaultLang: language,
        defaultCode: defaultMainCode(language),
        defaultStdin: "",
        defaultSqlDialect: DEFAULT_SQL_DIALECT,
    };
}

export function resolveToolDefaults(args: {
    subjectSlug: string;
    moduleMeta?: unknown;
    profileId?: string | null;
    versionFamily?: string | null;
    runtimeDefaults?: unknown;
    language?: string | null;
}): ToolDefaults {
    const {
        subjectSlug,
        moduleMeta,
        profileId,
        versionFamily,
        runtimeDefaults,
        language,
    } = args;

    const meta = (moduleMeta ?? {}) as {
        toolDefaults?: Partial<ToolDefaults>;
    };
    const authoredLanguage = meta.toolDefaults?.defaultLang;

    if (authoredLanguage) {
        return {
            ...toolDefaultsForLanguage(authoredLanguage),
            ...meta.toolDefaults,
            defaultLang: authoredLanguage,
        };
    }

    const resolvedLanguage = resolveCourseLanguage({
        subjectSlug,
        language,
        profileId,
        versionFamily,
        runtimeDefaults: isRecord(runtimeDefaults) ? runtimeDefaults : null,
    });

    return toolDefaultsForLanguage(resolvedLanguage);
}
