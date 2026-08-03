"use client";

import * as React from "react";
import type { Mode } from "@/lib/math/vec3";
import type { Vec3 } from "@/lib/math/vec3";
import type { VectorPadState } from "@/components/vectorpad/types";
import { angleBetween, clamp, dot, fmt, fmt2, mag, projOfAonB, radToDeg, scalarProjOfAonB, sub } from "@/lib/math/vec3";
import { KV } from "./ui";

export default React.memo(function LiveMathPanel({
                                                     mode,
                                                     t,
                                                     stateRef,
                                                     subscribe,
                                                 }: {
    mode: Mode;
    t: (key: string, values?: Record<string, any>) => string;
    stateRef: React.MutableRefObject<VectorPadState>;
    subscribe: (cb: () => void) => () => void;
}) {
    const [, bump] = React.useState(0);

    React.useEffect(() => subscribe(() => bump((x) => x + 1)), [subscribe]);

    const A: Vec3 = stateRef.current.a;
    const B: Vec3 = stateRef.current.b;

    const derived = React.useMemo(() => {
        const aMag = mag(A);
        const bMag = mag(B);
        const d = dot(A, B);
        const ang = angleBetween(A, B);
        const cosv = aMag > 1e-9 && bMag > 1e-9 ? clamp(d / (aMag * bMag), -1, 1) : NaN;

        const proj = projOfAonB(A, B);
        const perp = sub(A, proj);
        const sp = scalarProjOfAonB(A, B);

        return { aMag, bMag, dot: d, angleDeg: radToDeg(ang), cos: cosv, proj, perp, scalarProj: sp };
    }, [A, B]);

    const aLabel =
        mode === "2d" ? `(${fmt2(A.x)}, ${fmt2(A.y)})` : `(${fmt2(A.x)}, ${fmt2(A.y)}, ${fmt2(A.z)})`;

    const bLabel =
        mode === "2d" ? `(${fmt2(B.x)}, ${fmt2(B.y)})` : `(${fmt2(B.x)}, ${fmt2(B.y)}, ${fmt2(B.z)})`;

    return (
        <div className="border-b border-neutral-200 dark:border-white/10 p-3">
            <div className="mb-2 text-sm font-black text-neutral-900 dark:text-white/90">{t("sections.liveMath")}</div>

            <div className="grid grid-cols-3 gap-2">
                <KV label={t("live.aLabel", { dims: mode === "2d" ? "(ax, ay)" : "(ax, ay, az)" })} value={aLabel} />
                <KV label={t("live.magA")} value={fmt(derived.aMag)} />
                <KV label={t("live.dot")} value={fmt(derived.dot)} />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
                <KV label={t("live.bLabel", { dims: mode === "2d" ? "(bx, by)" : "(bx, by, bz)" })} value={bLabel} />
                <KV label={t("live.magB")} value={fmt(derived.bMag)} />
                <KV label={t("live.cos")} value={fmt(derived.cos)} />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
                <KV label={t("live.thetaDeg")} value={fmt2(derived.angleDeg)} />
                <KV label={t("live.scalarProj")} value={fmt(derived.scalarProj)} />
                <KV label={t("live.projLen")} value={fmt(mag(derived.proj))} />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
                <KV
                    label={t("live.projVec")}
                    value={
                        mode === "2d"
                            ? `(${fmt(derived.proj.x)}, ${fmt(derived.proj.y)})`
                            : `(${fmt(derived.proj.x)}, ${fmt(derived.proj.y)}, ${fmt(derived.proj.z)})`
                    }
                />
                <KV
                    label={t("live.perpVec")}
                    value={
                        mode === "2d"
                            ? `(${fmt(derived.perp.x)}, ${fmt(derived.perp.y)})`
                            : `(${fmt(derived.perp.x)}, ${fmt(derived.perp.y)}, ${fmt(derived.perp.z)})`
                    }
                />
                <KV label={t("live.perpLen")} value={fmt(mag(derived.perp))} />
            </div>
        </div>
    );
});
