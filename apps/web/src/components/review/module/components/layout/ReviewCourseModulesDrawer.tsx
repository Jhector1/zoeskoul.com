"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { CourseModuleNavItem } from "../../hooks/useModuleNav";
import MobileDrawer from "./MobileDrawer";

type Props = {
    open: boolean;
    reduceMotion: boolean;
    onClose: () => void;
    modules: CourseModuleNavItem[];
    loading: boolean;
    error: boolean;
    onSelectModule: (module: CourseModuleNavItem) => void | Promise<void>;
};

function ModuleRow({
                       item,
                       onSelect,
                   }: {
    item: CourseModuleNavItem;
    onSelect: (module: CourseModuleNavItem) => void | Promise<void>;
}) {
    const t = useTranslations("review.courseDrawer");
    const [pending, setPending] = React.useState(false);

    const handleClick = React.useCallback(async () => {
        if (pending) return;

        if (item.current) {
            await onSelect(item);
            return;
        }

        setPending(true);
        try {
            await onSelect(item);
        } catch {
            setPending(false);
        }
    }, [item, onSelect, pending]);

    return (
        <button
            type="button"
            data-testid={`review-course-module-${item.slug}`}
            aria-current={item.current ? "page" : undefined}
            aria-busy={pending || undefined}
            onClick={() => void handleClick()}
            className={cn(
                "group flex min-h-[74px] items-start gap-3 py-3",
                item.current ? "ui-review-topic-btn-active" : "ui-review-topic-btn",
                pending && "cursor-wait opacity-60",
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    "ui-review-module-index",
                    item.current
                        ? "ui-review-module-index-current"
                        : item.locked
                            ? "ui-review-module-index-locked"
                            : "ui-review-module-index-default",
                )}
            >
                {item.index + 1}
            </span>

            <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                    <span className="ui-title-sm min-w-0 leading-snug">
                        {item.title}
                    </span>

                    {item.current ? (
                        <span className="ui-pill-neutral shrink-0">{t("current")}</span>
                    ) : item.locked ? (
                        <span className="ui-pill-warn shrink-0 uppercase tracking-wide">
                            {t("locked")}
                        </span>
                    ) : null}
                </span>

                <span className="ui-meta mt-1 block text-xs">
                    {item.current
                        ? t("currentDescription")
                        : item.locked
                            ? t("lockedDescription")
                            : t("openDescription")}
                </span>
            </span>

            <span
                aria-hidden="true"
                className="ui-review-module-arrow"
            >
                {item.current ? "✓" : "→"}
            </span>
        </button>
    );
}

export default function ReviewCourseModulesDrawer({
                                                      open,
                                                      reduceMotion,
                                                      onClose,
                                                      modules,
                                                      loading,
                                                      error,
                                                      onSelectModule,
                                                  }: Props) {
    const t = useTranslations("review.courseDrawer");

    return (
        <MobileDrawer
            open={open}
            side="left"
            title={t("title")}
            reduceMotion={reduceMotion}
            onClose={onClose}
        >
            <div className="space-y-3 p-3" data-testid="review-course-modules-drawer">
                <div className="ui-surface-muted px-3 py-2.5">
                    <div className="ui-kicker">{t("kicker")}</div>
                    <div className="ui-title-sm mt-1 leading-snug">{t("description")}</div>
                </div>

                {loading ? (
                    <div className="grid gap-2" aria-label={t("loading")} role="status">
                        {[0, 1, 2, 3].map((item) => (
                            <div
                                key={item}
                                className="ui-review-module-skeleton"
                            />
                        ))}
                    </div>
                ) : error ? (
                    <div
                        role="alert"
                        className="ui-review-note-danger"
                    >
                        {t("error")}
                    </div>
                ) : modules.length > 0 ? (
                    <div className="grid gap-2">
                        {modules.map((item) => (
                            <ModuleRow key={item.slug} item={item} onSelect={onSelectModule} />
                        ))}
                    </div>
                ) : (
                    <div className="ui-review-note">
                        {t("empty")}
                    </div>
                )}
            </div>
        </MobileDrawer>
    );
}
