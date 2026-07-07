
// src/features/practice/client/PracticeClient.tsx
"use client";

import React from "react";
import PracticeShell from "@/components/practice/PracticeShell";
import { usePracticeController } from "@/features/practice/client/usePracticeController";
import { useTranslations } from "next-intl";
// import { usePracticeController } from "./usePracticeController";

export default function PracticeClient({
  subjectSlug,
  moduleSlug,
}: {
  subjectSlug: string;
  moduleSlug: string;
}) {
    const t = useTranslations("Practice");

  const { shellProps } = usePracticeController({ subjectSlug, moduleSlug });
  
  return <PracticeShell {...shellProps} t={t} />;
}
