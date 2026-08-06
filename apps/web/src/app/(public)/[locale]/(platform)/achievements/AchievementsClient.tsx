"use client";

import {
  AchievementsView,
  type AchievementsTranslate,
} from "@zoeskoul/learner-ui";
import { useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

const WEB_ACHIEVEMENTS_ENDPOINT = "/api/achievements";

function webCertificatePdfEndpoint(
  subjectSlug: string,
  locale: string,
) {
  return `/api/certificates/subject/pdf?subjectSlug=${encodeURIComponent(subjectSlug)}&locale=${encodeURIComponent(locale)}`;
}

export default function AchievementsClient() {
  const params = useParams<{ locale: string }>();
  const router = useRouter();
  const t = useTranslations("achievements");
  const translate = useCallback<AchievementsTranslate>(
    (key, values) => t(key, values),
    [t],
  );

  return (
    <AchievementsView
      locale={params?.locale ?? "en"}
      translate={translate}
      onBack={() => router.back()}
      onNavigate={(href) => router.push(href)}
      achievementsEndpoint={WEB_ACHIEVEMENTS_ENDPOINT}
      certificatePdfEndpoint={webCertificatePdfEndpoint}
    />
  );
}
