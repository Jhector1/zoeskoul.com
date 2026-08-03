import { notFound, redirect } from "next/navigation";

type PageProps = {
    params: Promise<{ locale: string; category: string }>;
};

function legacySandboxRedirect(locale: string, sandboxSlug: string) {
    switch (sandboxSlug) {
        case "online-python-compiler":
            return `/${locale}/sandbox/programming/python`;
        case "online-java-compiler":
            return `/${locale}/sandbox/programming/java`;
        case "online-javascript-editor":
            return `/${locale}/sandbox/programming/javascript`;
        case "online-c-compiler":
            return `/${locale}/sandbox/programming/c`;
        case "online-cpp-compiler":
            return `/${locale}/sandbox/programming/cpp`;
        case "online-sql-editor":
            return `/${locale}/sandbox/programming/sql`;
        case "linear-algebra":
            return `/${locale}/sandbox/math/linear-algebra`;
        case "programming":
            return `/${locale}/sandbox/programming/python`;
        default:
            return null;
    }
}

export default async function LegacySandboxPage({
                                                    params,
                                                }: PageProps) {
    const { locale, category } = await params;
    const target = legacySandboxRedirect(locale, category);

    if (!target) notFound();
    redirect(target);
}