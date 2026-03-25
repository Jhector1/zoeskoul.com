// src/components/review/module/hooks/useModuleNav.ts
"use client";

import { useEffect, useState } from "react";

export type ModuleNavInfo = {
  prevModuleId: string | null;
  nextModuleId: string | null;
  index: number;
  total: number;
} | null;

export function useModuleNav(args: { subjectSlug: string; moduleId: string }) {
  const { subjectSlug, moduleId } = args;
  const [nav, setNav] = useState<ModuleNavInfo | undefined>(undefined);

  useEffect(() => {
    if (!subjectSlug || !moduleId) return;
    setNav(undefined); // ✅ reset to loading on change

    const ctrl = new AbortController();

    fetch(`/api/review/module-nav?subjectSlug=${encodeURIComponent(subjectSlug)}&moduleId=${encodeURIComponent(moduleId)}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setNav(d))
        .catch((e) => {
          if (e?.name !== "AbortError") setNav(null);
        });

    return () => ctrl.abort();
  }, [subjectSlug, moduleId]);

  return nav;
}
