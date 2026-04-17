export type AppLocale = "en" | "fr" | "ht";

export type SeoRouteKey =
    | "home"
    | "billing"
    | "sandbox"
    | "contact"
    | "privacy"
    | "terms"
    | "cookies"
    | "refund"
    | "legal-index"
    | "acceptable-use"
    | "community"
    | "dmca"
    | "ai-policy"
    | "academic-integrity"
    | "data-rights"
    | "online-python-compiler"
    | "online-java-compiler"
    | "online-javascript-editor"
    | "online-c-compiler"
    | "online-cpp-compiler"
    | "online-sql-editor"
    | "sandbox-programming"
    | "sandbox-linear-algebra"|"sandbox-shell-practice"

export type SeoSubjectKey =
    | "python"
    | "linear-algebra"
    | "cybersecurity"
    | "haitian-creole"
    | "ai-chatgpt-kickstart";

export type SeoRouteEntry = {
    title: string;
    description: string;
    ogTitle?: string;
    ogDescription?: string;
    twitterTitle?: string;
    twitterDescription?: string;
};

export type SeoSubjectEntry = {
    title: string;
    description: string;
    ogTitle?: string;
    ogDescription?: string;
};

export type SeoBundle = {
    site: {
        name: string;
        shortName: string;
        defaultOgAlt: string;
    };
    shared: {
        keywords: string[];
    };
};