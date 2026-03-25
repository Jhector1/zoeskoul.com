"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export default function BillingError({ message }: { message: string }) {
    const t = useTranslations("billing");

    return (
        <div
            className={cn(
                "rounded-2xl border p-4",
                "border-rose-300/40 bg-rose-100/60 text-neutral-900",
                "dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-white/90",
            )}
        >
            <div className="font-black">{t("errors.title")}</div>
            <div className="mt-1 text-xs opacity-80">{message}</div>
        </div>
    );
}