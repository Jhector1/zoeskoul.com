"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type NavHref = Parameters<ReturnType<typeof useRouter>["push"]>[0];

type NavButtonProps = {
    href: NavHref;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    fullWidth?: boolean;
    showSpinner?: boolean;
    prefetch?: boolean;
    onClick?: () => void;
};

function normalizeHref(href: NavHref): NavHref {
    if (typeof href !== "string") return href;

    let path = href.startsWith("/") ? href : `/${href}`;
    const localeSet = new Set(routing.locales);

    while (true) {
        const parts = path.split("/");
        const first = parts[1];

        if (!first || !localeSet.has(first as (typeof routing.locales)[number])) {
            break;
        }

        path = "/" + parts.slice(2).join("/");
        if (path === "/") break;
    }

    return path || "/";
}

export default function NavButton({
                                      href,
                                      children,
                                      className,
                                      disabled = false,
                                      fullWidth = false,
                                      showSpinner = true,
                                      prefetch = false,
                                      onClick,
                                  }: NavButtonProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [isPending, startTransition] = useTransition();
    const [clicked, setClicked] = useState(false);

    const normalizedHref = useMemo(() => normalizeHref(href), [href]);

    const currentUrl = useMemo(() => {
        const qs = searchParams?.toString();
        return qs ? `${pathname}?${qs}` : pathname;
    }, [pathname, searchParams]);

    useEffect(() => {
        setClicked(false);
    }, [currentUrl]);

    useEffect(() => {
        if (prefetch) {
            router.prefetch(normalizedHref);
        }
    }, [normalizedHref, prefetch, router]);

    const loading = clicked || isPending;
    const isDisabled = disabled || loading;

    return (
        <button
            type="button"
            disabled={isDisabled}
            aria-busy={loading}
            onClick={() => {
                if (isDisabled) return;

                onClick?.();
                setClicked(true);

                startTransition(() => {
                    router.push(normalizedHref);
                });
            }}
            className={cn(
                "inline-flex items-center justify-center gap-2",
                fullWidth && "w-full sm:w-auto",
                loading && "pointer-events-none",
                className,
            )}
        >
            {showSpinner && loading ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : null}
            <span>{children}</span>
        </button>
    );
}