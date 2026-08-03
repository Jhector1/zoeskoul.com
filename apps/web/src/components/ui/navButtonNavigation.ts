export type NavButtonNavigationKind =
    | "none"
    | "external"
    | "router";

export function isAbsoluteHttpHref(
    href: string,
): boolean {
    return /^https?:\/\//i.test(href);
}

export function resolveNavButtonNavigationKind(
    href: unknown,
): NavButtonNavigationKind {
    if (href === null) {
        return "none";
    }

    return typeof href === "string" &&
        isAbsoluteHttpHref(href)
        ? "external"
        : "router";
}
