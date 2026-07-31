"use client";

import * as React from "react";
import VectorPad from "@/components/vectorpad/VectorPad";
import type { VectorPadState } from "@/components/vectorpad/types";
import type { Mode, Vec3 } from "@/lib/math/vec3";
import { COLORS } from "@/lib/math/vec3";

export default React.memo(function CanvasPanel({
                                                   mode,
                                                   t,
                                                   stateRef,
                                                   zHeldRef,
                                                   onScaleChange,
                                                   onPreview,
                                                   onCommit,
                                               }: {
    mode: Mode;
    t: (key: string, values?: Record<string, any>) => string;
    stateRef: React.MutableRefObject<VectorPadState>;
    zHeldRef: React.MutableRefObject<boolean>;
    onScaleChange: (n: number) => void;
    onPreview: (a: Vec3, b: Vec3) => void;
    onCommit: (a: Vec3, b: Vec3) => void;
}) {
    return (
        <div className="relative z-0 min-h-[520px] lg:min-h-[calc(100vh-28px)]">
            {/* HUD */}
            <div className="pointer-events-none absolute inset-3 flex items-start justify-between gap-3">
                <div className="max-w-[560px] ui-card bg-white/70 dark:bg-black/40 px-3 py-2 backdrop-blur-md">
                    <div className="text-sm font-black">{t("hud.controlsTitle")}</div>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-white/70">
                        {mode === "2d" ? (
                            <>{t("hud.controls2d")}</>
                        ) : (
                            <>
                                {t("hud.controls3d.beforeZ")}{" "}
                                <span className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[11px] dark:border-white/10 dark:bg-white/[0.06]">
                  Z
                </span>{" "}
                                {t("hud.controls3d.afterZ")}
                            </>
                        )}
                    </p>
                </div>

                <div className="max-w-[420px] text-right ui-card bg-white/70 dark:bg-black/40 px-3 py-2 backdrop-blur-md">
                    <div className="text-sm font-black">{t("hud.legendTitle")}</div>
                    <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-white/70">
            <span className="font-extrabold" style={{ color: COLORS.a }}>
              a
            </span>
                        ,{" "}
                        <span className="font-extrabold" style={{ color: COLORS.b }}>
              b
            </span>
                        ,{" "}
                        <span className="font-extrabold" style={{ color: COLORS.proj }}>
              proj₍b₎(a)
            </span>
                        ,{" "}
                        <span className="font-extrabold" style={{ color: COLORS.perp }}>
              a⊥
            </span>
                        , <span className="font-extrabold opacity-90">{t("hud.shadow")}</span>
                    </p>
                </div>
            </div>

            <div className="ui-card h-full w-full overflow-hidden">
                <VectorPad
                    mode={mode}
                    stateRef={stateRef}
                    zHeldRef={zHeldRef}
                    onScaleChange={onScaleChange}
                    onPreview={onPreview}
                    onCommit={onCommit}
                    previewThrottleMs={16}
                    className="relative h-full w-full min-h-[520px]"
                />
            </div>
        </div>
    );
});
