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
    () => import("./messages/en/module0.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/seo/metadata.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/sketchesVectorPart1.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/spanBasis.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/subjects.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/chrome/footer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/chrome/header.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/chrome/locale-switcher.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/chrome/user-menu.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/home/landing-page.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/home/onboarding.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/ide/code-runner.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/ide/editor-layout.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/ide/full-ide.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/ide/pdf-viewer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/ide/playground.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/ide/projects.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/ide/tools-panel.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/certificate-page.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/certificate-preview.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/content-card.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/exercise-renderer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/landings/matrices-part-1-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/landings/matrices-part-2-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/landings/python-basics-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/landings/vectors-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/matrices-part-2-page.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/missed-questions.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/module-intro.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/module-overviews.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/module-sidebar.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/practice.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/quiz-block.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/review-module.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/review-nav.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/review.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/sketch-block.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/learning/subject-modules.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/platform/achievements.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/platform/authenticate.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/platform/billing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/platform/contact.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/en/ui/platform/legal.json").then((m) => (m?.default ?? {}) as AnyObj),
  ],

  "es": [
    () => import("./messages/es/ui/ide/editor-layout.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/es/ui/ide/pdf-viewer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/es/ui/platform/authenticate.json").then((m) => (m?.default ?? {}) as AnyObj),
  ],

  "fr": [
    () => import("./messages/fr/module0.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/seo/metadata.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/sketchesVectorPart1.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/spanBasis.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/subjects.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/chrome/footer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/chrome/header.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/chrome/locale-switcher.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/chrome/user-menu.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/home/landing-page.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/home/onboarding.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/ide/editor-layout.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/ide/pdf-viewer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/ide/playground.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/content-card.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/exercise-renderer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/landings/matrices-part-1-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/landings/matrices-part-2-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/landings/vectors-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/matrices-part-2-page.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/missed-questions.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/module-intro.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/module-overviews.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/module-sidebar.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/practice.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/quiz-block.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/review-nav.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/sketch-block.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/learning/subject-modules.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/platform/authenticate.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/platform/billing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/platform/contact.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/fr/ui/platform/legal.json").then((m) => (m?.default ?? {}) as AnyObj),
  ],

  "ht": [
    () => import("./messages/ht/module0.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/seo/metadata.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/sketchesVectorPart1.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/spanBasis.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/subjects.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/chrome/footer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/chrome/header.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/chrome/locale-switcher.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/chrome/user-menu.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/home/landing-page.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/home/onboarding.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/ide/editor-layout.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/ide/full-ide.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/ide/pdf-viewer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/ide/playground.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/content-card.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/exercise-renderer.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/landings/matrices-part-1-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/landings/matrices-part-2-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/landings/vectors-landing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/matrices-part-2-page.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/missed-questions.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/module-intro.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/module-overviews.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/module-sidebar.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/practice.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/quiz-block.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/review-nav.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/sketch-block.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/learning/subject-modules.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/platform/authenticate.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/platform/billing.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/platform/contact.json").then((m) => (m?.default ?? {}) as AnyObj),
    () => import("./messages/ht/ui/platform/legal.json").then((m) => (m?.default ?? {}) as AnyObj),
  ],
};

export async function loadLocaleMessages(locale: string): Promise<AnyObj> {
  const fns = loaders[locale] ?? [];
  const parts = await Promise.all(fns.map((fn) => fn()));
  return parts.reduce((acc, part) => deepMerge(acc, part), {} as AnyObj);
}

export const AVAILABLE_MESSAGE_LOCALES = ["en","es","fr","ht"] as const;
