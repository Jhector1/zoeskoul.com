import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

type AnyObj = Record<string, any>;

function isObject(v: any): v is AnyObj {
    return v && typeof v === "object" && !Array.isArray(v);
}

async function safeJsonImport(p: Promise<any>) {
    try {
        const mod = await p;
        return (mod?.default ?? {}) as AnyObj;
    } catch {
        return {};
    }
}

// Deep merge so nested keys merge correctly (Header, Module0, etc.)
function deepMerge<T extends AnyObj>(base: T, override: AnyObj): T {
    const out: AnyObj = { ...base };

    for (const k of Object.keys(override ?? {})) {
        const bv = out[k];
        const ov = override[k];

        if (isObject(bv) && isObject(ov)) out[k] = deepMerge(bv, ov);
        else out[k] = ov;
    }

    return out as T;
}

async function loadBundles(locale: string) {
    const bundles = await Promise.all([
        safeJsonImport(import(`./messages/${locale}/common.json`)),
        safeJsonImport(import(`./messages/${locale}/playground.json`)),
        safeJsonImport(import(`./messages/${locale}/spanBasis.json`)),
        safeJsonImport(import(`./messages/${locale}/module0.json`)),
        safeJsonImport(import(`./messages/${locale}/practice.json`)),
        safeJsonImport(import(`./messages/${locale}/practiceSection.json`)),
        safeJsonImport(import(`./messages/${locale}/sketchesVectorPart1.json`)),
        safeJsonImport(import(`./messages/${locale}/matricesPart2Landing.json`)),
        safeJsonImport(import(`./messages/${locale}/home.json`)),
        safeJsonImport(import(`./messages/${locale}/exerciseRenderer.json`)),
        safeJsonImport(import(`./messages/${locale}/localeSwitcher.json`)),
        safeJsonImport(import(`./messages/${locale}/billing.json`)),
        safeJsonImport(import(`./messages/${locale}/authenticate.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects.json`)),
        safeJsonImport(import(`./messages/${locale}/missedQuestions.json`)),

        safeJsonImport(import(`./messages/${locale}/sketchBlockUi.json`)),

        safeJsonImport(import(`./messages/${locale}/subjects/python/module0/comments.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module0/workspace.json`)),

        safeJsonImport(import(`./messages/${locale}/subjects/python/module0/computer_intro.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module0/programming_intro.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module0/syntax_intro.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module1/errors_intro.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module1/data_types_intro.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module1/variables.json`)),


        safeJsonImport(import(`./messages/${locale}/subjects/python/module1/input_output_patterns.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module1/string_basics.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module1/operators_expressions.json`)),

        safeJsonImport(import(`./messages/${locale}/subjects/python/module2/conditionals.json`)),

        safeJsonImport(import(`./messages/${locale}/subjects/python/module2/loop_basics.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module2/list_basics.json`)),
        safeJsonImport(import(`./messages/${locale}/subjects/python/module2/function_basics.json`)),

        safeJsonImport(import(`./messages/${locale}/subjects/linear_algebra/module0/vectors1.json`)),

        safeJsonImport(import(`./messages/${locale}/quizblock.json`)),
        safeJsonImport(import(`./messages/${locale}/reviewNav.json`)),
        safeJsonImport(import(`./messages/${locale}/seo/metadata.json`)),
        safeJsonImport(import(`./messages/${locale}/ui/footer.json`)),
        safeJsonImport(import(`./messages/${locale}/ui/legal.json`)),
        safeJsonImport(import(`./messages/${locale}/ui/contact.json`)),

        safeJsonImport(import(`./messages/${locale}/ui/homeOnboarding.json`)),


        safeJsonImport(import(`./messages/${locale}/python1Modules.json`)),
        safeJsonImport(import(`./messages/${locale}/moduleSidebar.json`)),


    ]);

    // ✅ bundles are already plain objects
    return bundles.reduce((acc, obj) => deepMerge(acc, obj), {} as AnyObj);
}

export default getRequestConfig(async ({ requestLocale }) => {
    let locale = await requestLocale;

    if (!hasLocale(routing.locales, locale)) {
        locale = routing.defaultLocale;
    }

    const base = await loadBundles(routing.defaultLocale);
    const localized = locale === routing.defaultLocale ? {} : await loadBundles(locale);

    return {
        locale,
        messages: deepMerge(base, localized),

        onError(error) {
            if (process.env.NODE_ENV === "development") {
                console.error(error);
            }
        },

        getMessageFallback({ namespace, key }) {
            if (process.env.NODE_ENV === "development") {
                return namespace ? `${namespace}.${key}` : key;
            }
            return "";
        },
    };
});