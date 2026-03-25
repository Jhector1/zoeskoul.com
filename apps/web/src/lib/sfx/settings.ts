// src/lib/sfx/settings.ts
"use client";

export type SfxSettings = {
    enabled: boolean;
    volume: number; // 0..1
};

const LS_KEY = "learnoir.sfx";

export function readSfxSettings(): SfxSettings {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { enabled: true, volume: 0.7 };
        const v = JSON.parse(raw);
        return {
            enabled: typeof v.enabled === "boolean" ? v.enabled : true,
            volume: typeof v.volume === "number" ? clamp(v.volume) : 0.7,
        };
    } catch {
        return { enabled: true, volume: 0.7 };
    }
}

export function writeSfxSettings(next: SfxSettings) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
}

export function clamp(n: number) {
    return Math.max(0, Math.min(1, n));
}