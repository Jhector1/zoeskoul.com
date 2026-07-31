// src/lib/sfx/ui/SoundToggle.ts
"use client";

import React from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useSfx } from "@/lib/sfx/SfxProvider";

export default function SoundToggle() {
    const { enabled, setEnabled, volume, setVolume } = useSfx();

    return (
        <div className="mt-2 grid gap-2">
            <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-neutral-600 dark:text-white/60">
                    {enabled ? "Sound on" : "Sound off"}
                </div>

                <button
                    type="button"
                    onClick={() => setEnabled(!enabled)}
                    className="ui-btn ui-btn-secondary h-9 px-3"
                    aria-pressed={enabled}
                    aria-label={enabled ? "Turn sound off" : "Turn sound on"}
                >
                    {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    <span className="ml-2">{enabled ? "On" : "Off"}</span>
                </button>
            </div>

            <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-neutral-600 dark:text-white/60">Volume</div>

                <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((volume ?? 0.7) * 100)}
                    onChange={(e) => setVolume(Number(e.target.value) / 100)}
                    disabled={!enabled}
                    className="w-40 accent-emerald-400 disabled:opacity-50"
                    aria-label="Sound volume"
                />
            </div>
        </div>
    );
}