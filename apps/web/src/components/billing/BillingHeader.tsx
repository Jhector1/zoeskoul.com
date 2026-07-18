"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { BillingStatus } from "@/lib/billing/types";
import Badge from "./Badge";
import type { BillingHeadline } from "./deriveBillingHeadline";
import { SECTION_HEADER } from "./styles";

export default function BillingHeader({
                                          busy,
                                          loading,
                                          status,
                                          headlineBadge,
                                          onManageBilling,
                                          onSignIn,
                                      }: {
    busy: boolean;
    loading: boolean;
    status: BillingStatus | null;
    headlineBadge: BillingHeadline | null;
    onManageBilling: () => void;
    onSignIn: () => void;
}) {
    const t = useTranslations("billing");

    return (
        <div className={SECTION_HEADER}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="ui-kicker">{t("header.kicker")}</div>

                    <div className="mt-1 ui-title-md">{t("header.title")}</div>

                    <div className="mt-1 ui-meta">{t("header.subtitle")}</div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {headlineBadge ? <Badge tone={headlineBadge.tone}>{headlineBadge.text}</Badge> : null}
                        {status?.isAuthenticated ? (
                            <Badge>{t("header.signedIn")}</Badge>
                        ) : (
                            <Badge tone="warn">{t("header.signInRequired")}</Badge>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={onManageBilling}
                        disabled={busy || loading || !status?.isAuthenticated}
                        className={cn("ui-btn-secondary px-4", "disabled:cursor-not-allowed disabled:opacity-40")}
                    >
                        {t("header.manageBilling")}
                    </button>

                    {!status?.isAuthenticated ? (
                        <button
                            onClick={onSignIn}
                            disabled={busy || loading}
                            className={cn("ui-btn-primary px-4", "disabled:cursor-not-allowed disabled:opacity-40")}
                        >
                            {t("header.signIn")}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}