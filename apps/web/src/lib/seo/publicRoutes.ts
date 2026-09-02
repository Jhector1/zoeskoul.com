import { ROUTES } from "@zoeskoul/app-config";

export const PUBLIC_INDEXABLE_ROUTES = [
    ROUTES.home,
    ROUTES.pricing,
    ROUTES.contact,
    "/legal",
    ROUTES.sandbox,
] as const;

export const PUBLIC_NOINDEX_ROUTES = [] as const;