import { ROUTES } from "@zoeskoul/app-config";
import { LEARNING_PATH_KEYS } from "@/lib/marketing/publicLandingContent";

export const PUBLIC_INDEXABLE_ROUTES = [
  ROUTES.home,
  ROUTES.pricing,
  ROUTES.contact,
  ROUTES.sandbox,
  "/sandbox/programming",
  "/learn",
  ...LEARNING_PATH_KEYS.map((key) => `/learn/${key}`),
  "/students",
  "/teachers",
  "/schools",
] as const;

export const PUBLIC_NOINDEX_ROUTES = [
  ROUTES.privacy,
  ROUTES.terms,
  "/legal",
] as const;
