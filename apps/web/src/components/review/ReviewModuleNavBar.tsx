"use client";

import React from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { ROUTES } from "@/utils";

type Props = {
    locale: string;
    subjectSlug: string;
    prevModuleId: string | null;
    nextModuleId: string | null;
    nextLocked?: boolean;
    nextBillingHref?: string | null;
    canGoNext: boolean;
    isLastModule: boolean;
    canGetCertificate: boolean;
};

const ReviewModuleNavBar = React.forwardRef<HTMLDivElement, Props>(
    function ReviewModuleNavBar(
        {
            subjectSlug,
            prevModuleId,
            nextModuleId,
            nextLocked = false,
            nextBillingHref,
            canGoNext,
            isLastModule,
            canGetCertificate,
        },
        ref,
    ) {
        const router = useRouter();
        const t = useTranslations("reviewNav");

        const goModule = (mid: string) => {
            router.push(
                ROUTES.learningPath(
                    encodeURIComponent(subjectSlug),
                    encodeURIComponent(mid),
                ),
            );
            router.refresh();
        };

        const goCertificate = () => {
            router.push(`/subjects/${encodeURIComponent(subjectSlug)}/certificate`);
            router.refresh();
        };

        const goUnlockNext = () => {
            router.push(nextBillingHref || "/billing");
            router.refresh();
        };

        const showNextCta = Boolean(nextModuleId) && !isLastModule;
        const nextLabel = nextLocked ? "Unlock next" : t("buttons.nextModule");

        const showUnlockHint = !isLastModule && !canGoNext && Boolean(nextModuleId);
        const showCertificateHint = isLastModule && !canGetCertificate;
        const showHint = showUnlockHint || showCertificateHint;

        return (
            <div
                ref={ref}
                className={cn(
                    "pointer-events-none fixed z-50",
                    "left-4 right-4 bottom-4",
                    "sm:left-auto sm:right-6",
                )}
                style={{
                    bottom: "max(1rem, env(safe-area-inset-bottom))",
                }}
            >
                <div className="pointer-events-auto ml-auto flex w-full max-w-[min(100%,28rem)] flex-col items-end gap-2">
                    {showHint ? (
                        <div className="ui-surface-floating max-w-full rounded-2xl px-3 py-2 text-right">
                            <div className="ui-review-bottom-hint">
                                {showUnlockHint
                                    ? t.rich("hints.unlockNext", {
                                        next: (chunks) => (
                                            <span className="font-medium">{chunks}</span>
                                        ),
                                    })
                                    : t.rich("hints.unlockCertificate", {
                                        certificate: (chunks) => (
                                            <span className="font-medium">{chunks}</span>
                                        ),
                                    })}
                            </div>
                        </div>
                    ) : null}

                    <div className="ui-surface-floating rounded-2xl p-2">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                                type="button"
                                disabled={!prevModuleId}
                                onClick={() => prevModuleId && goModule(prevModuleId)}
                                className={cn(
                                    "ui-btn-secondary px-2.5",
                                    !prevModuleId && "cursor-not-allowed opacity-50",
                                )}
                                aria-label={t("buttons.prevModule")}
                                title={!prevModuleId ? t("aria.noPrev") : t("buttons.prevModule")}
                            >
                                <span aria-hidden>←</span>
                                <span>{t("buttons.prevModule")}</span>
                            </button>

                            {isLastModule ? (
                                <button
                                    type="button"
                                    disabled={!canGetCertificate}
                                    onClick={goCertificate}
                                    className={cn(
                                        canGetCertificate
                                            ? "ui-btn-primary px-2.5"
                                            : "ui-btn-secondary px-2.5 opacity-60 cursor-not-allowed",
                                    )}
                                    aria-label={t("buttons.getCertificate")}
                                    title={
                                        !canGetCertificate
                                            ? t("aria.lockedCertificate")
                                            : t("buttons.getCertificate")
                                    }
                                >
                                    <span>{t("buttons.getCertificate")}</span>
                                    <span aria-hidden>→</span>
                                </button>
                            ) : showNextCta ? (
                                <button
                                    type="button"
                                    disabled={!canGoNext}
                                    onClick={() => {
                                        if (!canGoNext) return;
                                        if (nextLocked) {
                                            goUnlockNext();
                                            return;
                                        }
                                        if (nextModuleId) goModule(nextModuleId);
                                    }}
                                    className={cn(
                                        nextLocked ? "ui-btn-premium px-2.5" : "ui-btn-primary px-2.5",
                                        !canGoNext && "cursor-not-allowed opacity-60",
                                    )}
                                    aria-label={nextLabel}
                                    title={!canGoNext ? t("aria.lockedNext") : nextLabel}
                                >
                                    <span>{nextLabel}</span>
                                    <span aria-hidden>→</span>
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        );
    },
);

ReviewModuleNavBar.displayName = "ReviewModuleNavBar";

export default ReviewModuleNavBar;