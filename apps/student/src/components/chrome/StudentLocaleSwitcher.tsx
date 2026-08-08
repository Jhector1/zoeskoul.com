"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@student/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { routing } from "@student/i18n/routing";
import { LocaleSwitcherChrome } from "@zoeskoul/learner-ui";
import ConfirmResetModal from "@/components/practice/ConfirmResetModal";
import { persistLocale } from "@/lib/locale/persistLocale";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";

export default function StudentLocaleSwitcher({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const sp = useSearchParams();

  const [isPending, startTransition] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingLocale, setPendingLocale] = React.useState<string | null>(null);
  const [changingTo, setChangingTo] = React.useState<string | null>(null);

  const search = sp.toString();
  const href = search ? `${pathname}?${search}` : pathname;

  const description = React.useMemo(() => {
    if (!pendingLocale) return "";
    return t("confirm.description", {
      from: String(locale).toUpperCase(),
      to: String(pendingLocale).toUpperCase(),
    });
  }, [pendingLocale, locale, t]);

  const requestChangeTo = (nextLocale: string) => {
    if (isPending) return;
    if (nextLocale === locale) return;
    setPendingLocale(nextLocale);
    setConfirmOpen(true);
  };

  const cancel = () => {
    if (isPending) return;
    setConfirmOpen(false);
    setPendingLocale(null);
  };

  const confirm = () => {
    if (isPending) return;
    if (!pendingLocale) return cancel();

    const nextLocale = pendingLocale;
    setChangingTo(nextLocale);
    persistLocale(nextLocale);
    setConfirmOpen(false);
    startGlobalNavigationPending({
      label: t("changingTo", { locale: nextLocale.toUpperCase() }),
      source: "locale-switcher",
      minVisibleMs: 500,
    });

    const hash =
      typeof window === "undefined" ? "" : window.location.hash;

    startTransition(() => {
      router.replace(`${href}${hash}`, { locale: nextLocale });
    });
  };

  return (
    <LocaleSwitcherChrome
      compact={compact}
      className={className}
      locales={routing.locales}
      locale={locale}
      isPending={isPending}
      changingTo={changingTo}
      ariaLabel={t("ariaLabel")}
      changingLabel={
        changingTo
          ? t("changingTo", { locale: changingTo.toUpperCase() })
          : t("changing")
      }
      switchToLabel={(nextLocale) =>
        t("switchTo", { locale: nextLocale.toUpperCase() })
      }
      onRequestChange={requestChangeTo}
      confirmDialog={
        confirmOpen ? (
          <ConfirmResetModal
            open={confirmOpen}
            title={t("confirm.title")}
            description={description}
            confirmText={t("confirm.confirmText")}
            cancelText={t("confirm.cancelText")}
            danger={false}
            onConfirm={confirm}
            onClose={cancel}
            panelClassName="max-w-[20rem]"
          />
        ) : null
      }
    />
  );
}
