"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export default function BillingError({ message }: { message: string }) {
    const t = useTranslations("billing");

    return (
        <div className={cn("ui-surface-danger p-4")}>
            <div className="ui-title-sm">{t("errors.title")}</div>
            <div className="mt-1 ui-meta-strong">{message}</div>
        </div>
    );
}