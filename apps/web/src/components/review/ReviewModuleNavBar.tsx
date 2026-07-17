"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { ROUTES } from "@/utils";
import NavButton from "@/components/ui/NavButton";

type Props = {
    show?: boolean;
    locale: string;
    subjectSlug: string;
    prevModuleId: string | null;
    nextModuleId: string | null;
    nextLocked?: boolean;
    nextBillingHref?: string | null;
    canGoNext: boolean;

    /**
     * Compact learner mode uses one contextual bottom nav for card, quiz, topic,
     * section/module, unlock, and certificate continuation.
     */
    compactSingleAction?: boolean;
    singlePrevLabel?: string;
    singlePrevDisabled?: boolean;
    onSinglePrev?: () => void | Promise<void>;
    singleNextLabel?: string;
    singleNextDisabled?: boolean;
    singleNextLocked?: boolean;
    onSingleNext?: () => void | Promise<void>;

    /** Show the module-level next CTA only at the actual module boundary. */
    showNextModuleCta?: boolean;

    showCertificateCta?: boolean;
    canGetCertificate: boolean;
    certificateLabel?: string;
    certificateHint?: string | null;
};

const ReviewModuleNavBar = React.forwardRef<HTMLDivElement, Props>(
    function ReviewModuleNavBar(
        {
            show = true,
            locale,
            subjectSlug,
            prevModuleId,
            nextModuleId,
            nextLocked = false,
            nextBillingHref,
            canGoNext,
            compactSingleAction = false,
            singlePrevLabel,
            singlePrevDisabled,
            onSinglePrev,
            singleNextLabel,
            singleNextDisabled,
            singleNextLocked = false,
            onSingleNext,
            showNextModuleCta = true,
            showCertificateCta = false,
            canGetCertificate,
            certificateLabel = "Get certificate",
            certificateHint = null,
        },
        ref,
    ) {
        if (!show) {
            return null;
        }

        const t = useTranslations("reviewNav");
        const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
        const [isDragging, setIsDragging] = React.useState(false);
        const dragStateRef = React.useRef<{
            pointerId: number;
            startX: number;
            startY: number;
            originX: number;
            originY: number;
            moved: boolean;
        } | null>(null);
        const didDragRef = React.useRef(false);

        const clampOffset = React.useCallback((x: number, y: number) => {
            if (typeof window === "undefined") return { x, y };

            const maxX = Math.max(0, window.innerWidth * 0.4);
            const minX = -maxX;
            const minY = -Math.max(0, window.innerHeight * 0.6);
            const maxY = Math.max(0, window.innerHeight * 0.18);

            return {
                x: Math.min(Math.max(x, minX), maxX),
                y: Math.min(Math.max(y, minY), maxY),
            };
        }, []);

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

        const showNextCta =
            showNextModuleCta && Boolean(nextModuleId) && !showCertificateCta;
        const nextLabel = nextLocked ? "Unlock next" : t("buttons.nextModule");
        const compactNextLabel = showCertificateCta
            ? certificateLabel
            : singleNextLabel ?? (singleNextLocked ? "Unlock next" : "Next");
        const compactPrevLabel = singlePrevLabel ?? "Previous";
        const compactPrevDisabled = Boolean(singlePrevDisabled);
        const compactNextDisabled = showCertificateCta
            ? !canGetCertificate
            : Boolean(singleNextDisabled);

        const showUnlockHint =
            !showCertificateCta &&
            showNextModuleCta &&
            Boolean(nextModuleId) &&
            (nextLocked || !canGoNext);
        const showCertificateHint =
            Boolean(showCertificateCta) && Boolean(certificateHint) && !canGetCertificate;
        const showHint = showUnlockHint || showCertificateHint;

        const handlePointerDown = React.useCallback(
            (event: React.PointerEvent<HTMLDivElement>) => {
                if (event.pointerType === "mouse" && event.button !== 0) return;
                if (
                    event.target instanceof Element &&
                    event.target.closest(
                        "button, a, input, textarea, select, [role='button'], [data-no-drag]",
                    )
                ) {
                    return;
                }

                dragStateRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    originX: dragOffset.x,
                    originY: dragOffset.y,
                    moved: false,
                };
                didDragRef.current = false;
                setIsDragging(true);

                event.currentTarget.setPointerCapture(event.pointerId);
            },
            [dragOffset],
        );

        const handlePointerMove = React.useCallback(
            (event: React.PointerEvent<HTMLDivElement>) => {
                const drag = dragStateRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;

                const nextX = drag.originX + (event.clientX - drag.startX);
                const nextY = drag.originY + (event.clientY - drag.startY);
                const movedEnough =
                    Math.abs(event.clientX - drag.startX) > 6 ||
                    Math.abs(event.clientY - drag.startY) > 6;

                if (movedEnough && !drag.moved) {
                    didDragRef.current = true;
                    dragStateRef.current = { ...drag, moved: true };
                }

                setDragOffset(clampOffset(nextX, nextY));
            },
            [clampOffset],
        );

        const endDrag = React.useCallback((pointerId: number) => {
            const drag = dragStateRef.current;
            if (!drag || drag.pointerId !== pointerId) return;
            dragStateRef.current = null;
            setIsDragging(false);
        }, []);

        const handlePointerUp = React.useCallback(
            (event: React.PointerEvent<HTMLDivElement>) => {
                endDrag(event.pointerId);
            },
            [endDrag],
        );

        const handlePointerCancel = React.useCallback(
            (event: React.PointerEvent<HTMLDivElement>) => {
                endDrag(event.pointerId);
            },
            [endDrag],
        );

        const handleClickCapture = React.useCallback(
            (event: React.MouseEvent<HTMLDivElement>) => {
                if (!didDragRef.current) return;
                event.preventDefault();
                event.stopPropagation();
                didDragRef.current = false;
            },
            [],
        );

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
                <div
                    className={cn(
                        "pointer-events-auto ml-auto flex w-full max-w-[min(100%,28rem)] flex-col items-end gap-2",
                        isDragging ? "cursor-grabbing" : "cursor-grab",
                    )}
                    style={{
                        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                        touchAction: "none",
                    }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onClickCapture={handleClickCapture}
                >
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
                            {compactSingleAction ? (
                                <>
                                    <NavButton
                                        onClick={onSinglePrev}
                                        disabled={compactPrevDisabled}
                                        className={cn(
                                            "ui-btn-secondary px-3",
                                            compactPrevDisabled && "cursor-not-allowed opacity-50",
                                        )}
                                        loadingText="Loading…"
                                    >
                                        <span aria-hidden>←</span>
                                        <span>{compactPrevLabel}</span>
                                    </NavButton>

                                    <NavButton
                                        href={
                                            showCertificateCta
                                                ? certificateHref
                                                : singleNextLocked
                                                    ? unlockHref
                                                    : undefined
                                        }
                                        onClick={
                                            showCertificateCta || singleNextLocked
                                                ? undefined
                                                : onSingleNext
                                        }
                                        disabled={compactNextDisabled}
                                        prefetch={showCertificateCta && canGetCertificate}
                                        className={cn(
                                            showCertificateCta && !canGetCertificate
                                                ? "ui-btn-secondary opacity-60 cursor-not-allowed"
                                                : singleNextLocked
                                                    ? "ui-btn-premium"
                                                    : "ui-btn-primary",
                                            "px-4",
                                        )}
                                        loadingText="Loading…"
                                    >
                                        <span>{compactNextLabel}</span>
                                        <span aria-hidden>→</span>
                                    </NavButton>
                                </>
                            ) : (
                                <>
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
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    },
);

ReviewModuleNavBar.displayName = "ReviewModuleNavBar";

export default ReviewModuleNavBar;
