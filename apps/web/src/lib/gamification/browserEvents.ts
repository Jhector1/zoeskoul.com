"use client";

import type { GamificationSummary } from "./types";

export type GamificationClientUpdate = {
    source: "validate" | "review_progress" | "summary";
    xpGained?: number;
    leveledUp?: boolean;
    streakExtended?: boolean;
    summary: GamificationSummary;
};

const EVENT_NAME = `${process.env.NEXT_PUBLIC_APP_NAME}:gamification:update`;

export function emitGamificationUpdate(payload: GamificationClientUpdate) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
}

export function subscribeGamificationUpdate(
    listener: (payload: GamificationClientUpdate) => void,
) {
    if (typeof window === "undefined") return () => {};

    const handler = (event: Event) => {
        const custom = event as CustomEvent<GamificationClientUpdate>;
        if (custom.detail) listener(custom.detail);
    };

    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
}