import { ROUTES } from "@/utils";

export const PUBLIC_INDEXABLE_ROUTES = [
    ROUTES.home,
    ROUTES.pricing,
    ROUTES.contact,
    ROUTES.privacy,
    ROUTES.terms
] as const;

export const PUBLIC_NOINDEX_ROUTES = [
    ROUTES.sandbox
] as const;