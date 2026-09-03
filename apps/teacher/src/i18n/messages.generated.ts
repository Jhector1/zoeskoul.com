/* eslint-disable */
// AUTO-GENERATED FILE.
// Do not edit manually.
// Run: pnpm i18n:generate

type AnyObj = Record<string, any>;

function isObject(v: unknown): v is AnyObj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

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

const loaders: Record<string, Array<() => Promise<AnyObj>>> = {
  "en": [
    () => import("./messages/en/ui/teacher/assignments.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/teacher/classes.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/teacher/reports.json").then((m) => (m?.default ?? {}) as AnyObj),
  ],

  "es": [
    () => import("./messages/es/ui/teacher/assignments.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/es/ui/teacher/classes.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/es/ui/teacher/reports.json").then((m) => (m?.default ?? {}) as AnyObj),
  ],

  "fr": [
    () => import("./messages/fr/ui/teacher/assignments.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/teacher/classes.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/teacher/reports.json").then((m) => (m?.default ?? {}) as AnyObj),
  ],

  "ht": [
    () => import("./messages/ht/ui/teacher/assignments.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/teacher/classes.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/teacher/reports.json").then((m) => (m?.default ?? {}) as AnyObj),
  ],
};

export async function loadLocaleMessages(locale: string): Promise<AnyObj> {
  const fns = loaders[locale] ?? [];
  const parts = await Promise.all(fns.map((fn) => fn()));
  return parts.reduce((acc, part) => deepMerge(acc, part), {} as AnyObj);
}

export const AVAILABLE_MESSAGE_LOCALES = ["en","es","fr","ht"] as const;
