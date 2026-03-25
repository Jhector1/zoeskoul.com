// src/lib/practice/landingCatalog.ts

export type LandingPart = {
  id: string;
  badgeKey: string;
  titleKey: string;
  subtitleKey: string;
  learnHref: string;
  practiceHref: string;
  bulletsCount: number;
  accent: "emerald" | "sky" | "violet" | "amber";
};

export type LandingPageConfig = {
  namespace: string;
  pageTitleKey: string;
  pageIntroKey: string;

  quickStarts?: Array<{
    labelKey: string;
    href: string;
    accent: LandingPart["accent"];
  }>;

  parts: LandingPart[];

  recommended?: {
    titleKey: string;
    itemsCount: number;
  };

  routeHintKey?: string;
};

// ✅ Vectors landing config
export const vectorsLanding: LandingPageConfig = {
  namespace: "VectorsLanding",
  pageTitleKey: "pageTitle",
  pageIntroKey: "pageIntro",
  quickStarts: [
    {
      labelKey: "quickStartPart1Easy",
      href: "/practice?section=module-0-vectors-part-1&difficulty=easy&topic=vectors_part1",
      accent: "emerald",
    },
    {
      labelKey: "jumpPart2Easy",
      href: "/practice?section=module-0-vectors-part-2&difficulty=easy&topic=vectors_part2",
      accent: "sky",
    },
  ],
  parts: [
    {
      id: "part-1",
      badgeKey: "parts.part1.badge",
      titleKey: "parts.part1.title",
      subtitleKey: "parts.part1.subtitle",
      learnHref: "/practice/review/vectors_part1",
      practiceHref: "/practice?section=module-0-vectors-part-1&difficulty=all&topic=vectors_part1",
      bulletsCount: 8,
      accent: "emerald",
    },
    {
      id: "part-2",
      badgeKey: "parts.part2.badge",
      titleKey: "parts.part2.title",
      subtitleKey: "parts.part2.subtitle",
      learnHref: "/practice/review/vectors_part2",
      practiceHref: "/practice?section=module-0-vectors-part-2&difficulty=all&topic=vectors_part2",
      bulletsCount: 8,
      accent: "sky",
    },
  ],
  recommended: { titleKey: "recommendedPathTitle", itemsCount: 3 },
  routeHintKey: "routeHint",
};

// ✅ Matrices Part 1 landing config
export const matricesPart1Landing: LandingPageConfig = {
  namespace: "MatricesPart1Landing",
  pageTitleKey: "pageTitle",
  pageIntroKey: "pageIntro",
  quickStarts: [
    {
      labelKey: "quickStartEasy",
      // use your real section slug if different:
      href: "/practice?section=module-2-matrices-part-1&difficulty=easy&topic=m2.matrices_intro",
      accent: "violet",
    },
  ],
  parts: [
    {
      id: "part-1",
      badgeKey: "parts.part1.badge",
      titleKey: "parts.part1.title",
      subtitleKey: "parts.part1.subtitle",
      learnHref: "/practice/review/matrices_part1",
      practiceHref: "/practice?section=module-2-matrices-part-1&difficulty=all&topic=m2.matrices_intro",
      bulletsCount: 8,
      accent: "violet",
    },
  ],
  recommended: { titleKey: "recommendedPathTitle", itemsCount: 3 },
  routeHintKey: "routeHint",
};

// ✅ NEW: Matrices Part 2 landing config (Part 3 in catalog)
export const matricesPart2Landing: LandingPageConfig = {
  namespace: "MatricesPart2Landing",
  pageTitleKey: "pageTitle",
  pageIntroKey: "pageIntro",
  quickStarts: [
    {
      labelKey: "quickStartEasy",
      // start at a “first” part-2 topic (adjust to your actual m3 slug)
      href: "/practice?section=module-3-matrices-part-2&difficulty=easy&topic=m3.norms",
      accent: "amber",
    },
    {
      labelKey: "jumpRankEasy",
      href: "/practice?section=module-3-matrices-part-2&difficulty=easy&topic=m3.rank_tolerance",
      accent: "sky",
    },
  ],
  parts: [
    {
      id: "part-2",
      badgeKey: "parts.part2.badge",
      titleKey: "parts.part2.title",
      subtitleKey: "parts.part2.subtitle",
      learnHref: "/practice/review/matrices_part2",
      practiceHref: "/practice?section=module-3-matrices-part-2&difficulty=all&topic=m3.norms",
      bulletsCount: 8,
      accent: "amber",
    },
  ],
  recommended: { titleKey: "recommendedPathTitle", itemsCount: 3 },
  routeHintKey: "routeHint",
};

export const ALL_LANDINGS: LandingPageConfig[] = [
  vectorsLanding,
  matricesPart1Landing,
  matricesPart2Landing, // ✅ register part 3
];
