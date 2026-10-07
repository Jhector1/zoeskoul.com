"use client";

import type { ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTaggedT } from "@student/i18n/tagged";
import SharedPracticeScopeSelector from "@zoeskoul/learner-workspace/components/practice/shell/PracticeScopeSelector";
import { PracticeScopeSelectorBridgeProvider } from "@zoeskoul/learner-workspace/components/practice/shell/PracticeScopeSelectorBridge";

type Props = ComponentProps<typeof SharedPracticeScopeSelector>;

export default function PracticeScopeSelector(props: Props) {
  const router = useRouter();
  const t = useTranslations("Practice.workspace");
  const tagged = useTaggedT();

  return (
    <PracticeScopeSelectorBridgeProvider
      value={{
        t: (key) => t(key),
        resolveText: (value, fallback) =>
          tagged.resolve(value, fallback),
        pushRoute: (href, options) => router.push(href, options),
      }}
    >
      <SharedPracticeScopeSelector {...props} />
    </PracticeScopeSelectorBridgeProvider>
  );
}
