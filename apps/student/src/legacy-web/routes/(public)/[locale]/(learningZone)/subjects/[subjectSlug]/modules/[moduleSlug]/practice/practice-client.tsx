// src/features/practice/client/PracticeClient.tsx
"use client";

import React from "react";
import PracticeShell from "@/components/practice/PracticeShell";
import { usePracticeController } from "@/features/practice/client/usePracticeController";
import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import { useTranslations } from "next-intl";

export default function PracticeClient({
  subjectSlug,
  moduleSlug,
  sessionId,
  initialExperienceMode,
}: {
  subjectSlug: string;
  moduleSlug: string;
  sessionId: string | null;
  initialExperienceMode: PracticeExperienceMode;
}) {
  const t = useTranslations("Practice");

  const { shellProps } = usePracticeController({
    subjectSlug,
    moduleSlug,
    sessionId: sessionId ?? undefined,
    authoritativeSessionId: Boolean(sessionId),
    surface: "module_practice",
    initialExperienceMode,
  });

  return <PracticeShell {...shellProps} t={t} />;
}
