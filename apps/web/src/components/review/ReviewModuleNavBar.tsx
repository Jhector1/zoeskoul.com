"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { ROUTES } from "@/utils";
import NavButton from "@/components/ui/NavButton";

type Props = {
    locale: string;
    subjectSlug: string;
    prevModuleId: string | null;
    nextModuleId: string | null;
    nextLocked?: boolean;
    nextBillingHref?: string | null;
    canGoNext: boolean;

    showCertificateCta?: boolean;
    canGetCertificate: boolean;
    certificateLabel?: string;
    certificateHint?: string | null;
};

const ReviewModuleNavBar = React.forwardRef<HTMLDivElement, Props>(
    function ReviewModuleNavBar(
        {
            locale,
            subjectSlug,
            prevModuleId,
            nextModuleId,
            nextLocked = false,
            nextBillingHref,
            canGoNext,
            showCertificateCta = false,
            canGetCertificate,
            certificateLabel = "Get certificate",
            certificateHint = null,
        },
        ref,
    ) {
        const t = useTranslations("reviewNav");

        const prevHref = prevModuleId
            ? `/${encodeURIComponent(locale)}/${ROUTES.learningPath(
                encodeURIComponent(subjectSlug),
                encodeURIComponent(prevModuleId),
            )}`
            : undefined;

        const nextModuleHref = nextModuleId
            ? `/${encodeURIComponent(locale)}/${ROUTES.learningPath(
                encodeURIComponent(subjectSlug),
                encodeURIComponent(nextModuleId),
            )}`
            : undefined;

        const unlockHref = nextBillingHref || `/${encodeURIComponent(locale)}/billing`;

        const certificateHref = `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(
            subjectSlug,
        )}/certificate`;

        const showNextCta = Boolean(nextModuleId) && !showCertificateCta;
        const nextLabel = nextLocked ? "Unlock next" : t("buttons.nextModule");

        const showUnlockHint = !showCertificateCta && !canGoNext && Boolean(nextModuleId);
        const showCertificateHint =
            Boolean(showCertificateCta) && Boolean(certificateHint) && !canGetCertificate;
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
                                {showUnlockHint ? (
                                    t.rich("hints.unlockNext", {
                                        next: (chunks) => (
                                            <span className="font-medium">{chunks}</span>
                                        ),
                                    })
                                ) : (
                                    <span>{certificateHint}</span>
                                )}
                            </div>
                        </div>
                    ) : null}

                    <div className="ui-surface-floating rounded-2xl p-2">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <NavButton
                                href={prevHref ?? ""}
                                disabled={!prevHref}
                                prefetch={Boolean(prevHref)}
                                className={cn(
                                    "ui-btn-secondary px-2.5",
                                    !prevHref && "cursor-not-allowed opacity-50",
                                )}
                            >
                                <span aria-hidden>←</span>
                                <span>{t("buttons.prevModule")}</span>
                            </NavButton>

                            {showCertificateCta ? (
                                <NavButton
                                    href={certificateHref}
                                    disabled={!canGetCertificate}
                                    prefetch={canGetCertificate}
                                    className={cn(
                                        canGetCertificate
                                            ? "ui-btn-primary px-2.5"
                                            : "ui-btn-secondary px-2.5 opacity-60 cursor-not-allowed",
                                    )}
                                >
                                    <span>{certificateLabel}</span>
                                    <span aria-hidden>→</span>
                                </NavButton>
                            ) : showNextCta ? (
                                <NavButton
                                    href={nextLocked ? unlockHref : nextModuleHref ?? ""}
                                    disabled={!canGoNext}
                                    prefetch={canGoNext}
                                    className={cn(
                                        nextLocked ? "ui-btn-premium px-2.5" : "ui-btn-primary px-2.5",
                                        !canGoNext && "cursor-not-allowed opacity-60",
                                    )}
                                >
                                    <span>{nextLabel}</span>
                                    <span aria-hidden>→</span>
                                </NavButton>
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