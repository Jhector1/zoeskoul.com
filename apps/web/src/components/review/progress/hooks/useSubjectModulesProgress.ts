// src/app/(public)/[locale]/subjects/[subjectSlug]/modules/useSubjectModulesProgress.ts
"use client";

import { useEffect, useState } from "react";

export type ModuleProgress = {
  moduleCompleted: boolean;
  completedTopicKeys: Set<string>;
};

function addKey(set: Set<string>, v: any) {
  if (v == null) return;
  set.add(String(v));
}

function parseModuleProgress(progress: any): ModuleProgress {
  const moduleCompleted = Boolean(progress?.moduleCompleted);

  const topicsObj = progress?.topics ?? {};
  const completedTopicKeys = new Set<string>();

  for (const [k, tp] of Object.entries<any>(topicsObj)) {
    if (!tp?.completed) continue;

    // the object key itself (often your "topic key")
    addKey(completedTopicKeys, k);

    // tolerate other shapes if your API includes them
    addKey(completedTopicKeys, tp.topicKey);
    addKey(completedTopicKeys, tp.topicSlug);
    addKey(completedTopicKeys, tp.slug);
    addKey(completedTopicKeys, tp.genKey);
    addKey(completedTopicKeys, tp.topicId);
    addKey(completedTopicKeys, tp.id);
  }

  return { moduleCompleted, completedTopicKeys };
}

export function useSubjectModulesProgress(args: {
  moduleSlugs: string[];
  subjectSlug: string;
  locale: string;
}) {
  const { moduleSlugs, subjectSlug, locale } = args;

  const [loading, setLoading] = useState(true);
  const [byModuleSlug, setByModuleSlug] = useState<Record<string, ModuleProgress>>({});

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);

      const results = await Promise.all(
        moduleSlugs.map(async (moduleId) => {
          try {
            const url =
              `/api/review/progress?subjectSlug=${encodeURIComponent(subjectSlug)}` +
              `&moduleId=${encodeURIComponent(moduleId)}` +
              `&locale=${encodeURIComponent(locale)}` +
              `&_=${Date.now()}`; // cache-bust if anything is sticky

            const r = await fetch(url, { cache: "no-store" });
            const d = r.ok ? await r.json() : null;
            const mp = parseModuleProgress(d?.progress ?? null);
            return [moduleId, mp] as const;
          } catch {
            return [moduleId, { moduleCompleted: false, completedTopicKeys: new Set<string>() }] as const;
          }
        }),
      );

      if (!alive) return;

      const next: Record<string, ModuleProgress> = {};
      for (const [slug, mp] of results) next[slug] = mp;
      setByModuleSlug(next);
      setLoading(false);
    }

    run();
    return () => {
      alive = false;
    };
  }, [moduleSlugs, subjectSlug, locale]);

  return { loading, byModuleSlug };
}
