import {
  AchievementsView,
  type AchievementsTranslate,
} from "@zoeskoul/learner-ui";
import { useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

const STUDENT_ACHIEVEMENTS_ENDPOINT = "/api/student-ui/achievements";

function studentCertificatePdfEndpoint(
  subjectSlug: string,
  locale: string,
) {
  return `/api/student-ui/certificates/subject/pdf?subjectSlug=${encodeURIComponent(subjectSlug)}&locale=${encodeURIComponent(locale)}`;
}

export function ExactAchievementsView() {
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
      achievementsEndpoint={STUDENT_ACHIEVEMENTS_ENDPOINT}
      certificatePdfEndpoint={studentCertificatePdfEndpoint}
    />
  );
}
