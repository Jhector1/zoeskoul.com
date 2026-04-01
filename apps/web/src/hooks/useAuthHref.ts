"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { buildLocalCallbackUrl } from "@/lib/auth/callback-url";
import { buildAuthenticateHref } from "@/lib/auth/auth-href";

export function useAuthHref() {
    const locale = useLocale();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    return useMemo(() => {
        const callbackUrl = buildLocalCallbackUrl({
            locale,
            pathname,
            search: searchParams?.toString() || "",
        });

        return buildAuthenticateHref(callbackUrl);
    }, [locale, pathname, searchParams]);
}