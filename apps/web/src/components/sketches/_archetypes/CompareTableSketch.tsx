"use client";

import React from "react";
import type { SavedSketchState } from "../subjects/types";
import type { CompareTableSpec } from "../subjects/specTypes";

export default function CompareTableSketch({
                                               spec,
                                           }: {
    spec: CompareTableSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]">
            <table className="min-w-[720px] w-full text-sm">
                <thead>
                <tr className="border-b border-neutral-200 dark:border-white/10">
                    {spec.columns.map((c) => (
                        <th key={c} className="px-4 py-3 text-left text-xs font-black text-neutral-600 dark:text-white/60">
                            {c}
                        </th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {spec.rows.map((r) => (
                    <tr key={r.id} className="border-b border-neutral-100 dark:border-white/5">
                        {r.cells.map((cell, i) => (
                            <td key={i} className="px-4 py-3 text-neutral-800 dark:text-white/80">
                                {cell}
                            </td>
                        ))}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}
