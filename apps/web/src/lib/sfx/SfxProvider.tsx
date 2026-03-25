// src/lib/sfx/SfxProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onSfx } from "./bus";
import { play, unlockAndPreload } from "./engine";
import { readSfxSettings, writeSfxSettings, clamp } from "./settings";

type SfxCtx = {
    enabled: boolean;
    volume: number;
    setEnabled: (v: boolean) => void;
    setVolume: (v: number) => void;
};

const Ctx = createContext<SfxCtx | null>(null);

export function SfxProvider({ children }: { children: React.ReactNode }) {
    const [enabled, setEnabled] = useState(true);
    const [volume, setVolume] = useState(0.7);

    // load persisted settings once
    useEffect(() => {
        const s = readSfxSettings();
        setEnabled(s.enabled);
        setVolume(s.volume);
    }, []);

    // persist on changes
    useEffect(() => {
        writeSfxSettings({ enabled, volume });
    }, [enabled, volume]);

    // unlock once on first user gesture
    useEffect(() => {
        const onFirst = () => {
            void unlockAndPreload();
            window.removeEventListener("pointerdown", onFirst, true);
            window.removeEventListener("keydown", onFirst, true);
        };
        window.addEventListener("pointerdown", onFirst, true);
        window.addEventListener("keydown", onFirst, true);
        return () => {
            window.removeEventListener("pointerdown", onFirst, true);
            window.removeEventListener("keydown", onFirst, true);
        };
    }, []);

    // listen for events (respect enabled/volume)
    useEffect(() => {
        const off1 = onSfx("answer:correct", () => enabled && play("answer:correct", volume));
        const off2 = onSfx("answer:wrong", () => enabled && play("answer:wrong", volume));
        return () => {
            off1();
            off2();
        };
    }, [enabled, volume]);

    const value = useMemo(
        () => ({
            enabled,
            volume,
            setEnabled,
            setVolume: (v: number) => setVolume(clamp(v)),
        }),
        [enabled, volume]
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSfx() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useSfx must be used within SfxProvider");
    return v;
}