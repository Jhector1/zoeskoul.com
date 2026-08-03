"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";

type NavHref = Parameters<ReturnType<typeof useRouter>["push"]>[0];

type NavButtonProps = {
    /**
     * Optional now:
     * - provide href for route navigation
     * - omit href for local/in-page navigation such as Previous/Next slideshow
     */
    href?: NavHref;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    fullWidth?: boolean;
    showSpinner?: boolean;
    title?: string;
    prefetch?: boolean;
    onClick?: () => void | Promise<void>;
    style?: React.CSSProperties;
    /**
     * Use this when the current page must fully reload from the server.
     * Good for course-content-update banners.
     */
    hardReload?: boolean;
    hardReloadCurrent?: boolean;
    /**
     * Optional text while navigation/reload is happening.
     */
    loadingText?: React.ReactNode;
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
                                      title,

                                      hardReload = false,
                                      hardReloadCurrent = false,
                                      loadingText,
                                      style = {},
                                  }: NavButtonProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [isPending, startTransition] = useTransition();
    const [clicked, setClicked] = useState(false);

    const normalizedHref = useMemo(
        () => (href === undefined ? null : normalizeHref(href)),
        [href],
    );

    const currentUrl = useMemo(() => {
        const qs = searchParams?.toString();
        return qs ? `${pathname}?${qs}` : pathname;
    }, [pathname, searchParams]);

    useEffect(() => {
        setClicked(false);
    }, [currentUrl]);

    useEffect(() => {
        if (prefetch && !hardReload && normalizedHref !== null) {
            router.prefetch(normalizedHref);
        }
    }, [normalizedHref, prefetch, hardReload, router]);

    const loading = clicked || isPending;
    const isDisabled = disabled || loading || (!onClick && normalizedHref === null);

    return (
        <button
            type="button"
            disabled={isDisabled}
            aria-busy={loading}
            title={title}
            onClick={async () => {
                if (isDisabled) return;

                setClicked(true);

                try {
                    const clickResult = onClick?.();

                    if (hardReload || hardReloadCurrent) {
                        startGlobalNavigationPending({
                            label: typeof loadingText === "string" ? loadingText : "Loading…",
                            source: "nav-button-reload",
                            minVisibleMs: 500,
                        });
                        /**
                         * Let React paint the loading spinner before the browser reloads.
                         */
                        window.setTimeout(() => {
                            if (hardReloadCurrent) {
                                window.location.reload();
                                return;
                            }

                            if (typeof normalizedHref === "string") {
                                window.location.assign(normalizedHref);
                                return;
                            }

                            window.location.reload();
                        }, 80);

                        return;
                    }

                    /**
                     * Local/in-page navigation path.
                     *
                     * Used by review module Previous/Next slideshow controls.
                     * There is no href, so do not call router.push.
                     */
                    if (normalizedHref === null) {
                        await clickResult;
                        setClicked(false);
                        return;
                    }

                    /**
                     * Route navigation path.
                     *
                     * Preserve old behavior: call optional onClick, then push.
                     * The clicked state resets when pathname/search changes.
                     */
                    startGlobalNavigationPending({
                        label: typeof loadingText === "string" ? loadingText : "Loading…",
                        source: "nav-button",
                        minVisibleMs: 350,
                    });

                    startTransition(() => {
                        router.push(normalizedHref);
                    });
                } catch (error) {
                    setClicked(false);
                    throw error;
                }
            }}
            className={cn(
                "inline-flex items-center justify-center gap-2",
                fullWidth && "w-full sm:w-auto",
                loading && "pointer-events-none",
                className,
            )}
            style={style}
        >
            {showSpinner && loading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : null}

            <span>{loading && loadingText ? loadingText : children}</span>
        </button>
    );
}