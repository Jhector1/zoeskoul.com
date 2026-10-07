"use client";

import React, { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import SharedRingButton, {
    type ReviewRingButtonProps,
} from "@zoeskoul/learner-workspace/review/components/RingButton";

export type RingButtonProps = ReviewRingButtonProps;

export default function RingButton(props: ReviewRingButtonProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const navigationKey = useMemo(() => {
        const qs = searchParams?.toString();
        return qs ? `${pathname}?${qs}` : pathname;
    }, [pathname, searchParams]);

    const navigate = useCallback(
        (href: string) => {
            router.push(href);
        },
        [router],
    );

    const prefetchHref = useCallback(
        (href: string) => {
            router.prefetch(href);
        },
        [router],
    );

    return (
        <SharedRingButton
            {...props}
            navigationKey={navigationKey}
            navigate={navigate}
            prefetchHref={prefetchHref}
        />
    );
}
