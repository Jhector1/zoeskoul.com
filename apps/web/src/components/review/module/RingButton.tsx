"use client";

import React from "react";

export default function RingButton(props: {
    disabled?: boolean;
    onClick?: () => void;
    pct: number;
    missedPct?: number;
    label: string;
    sublabel?: string;
}) {
    const green = Math.max(0, Math.min(1, props.pct ?? 0));
    const redRaw = Math.max(0, Math.min(1, props.missedPct ?? 0));
    const red = Math.max(0, Math.min(1 - green, redRaw));

    const greenDeg = green * 360;
    const redDeg = red * 360;
    const cut1 = greenDeg;
    const cut2 = greenDeg + redDeg;

    return (
        <button
            type="button"
            disabled={props.disabled}
            onClick={props.onClick}
            className="ui-ring-button"
        >
            <div className="flex items-center justify-between gap-3">
        <span
            className="ui-ring-meter [--ring-track:rgb(var(--ui-border-soft)/1)]"
            style={{
                background: `conic-gradient(
              from 90deg,
              rgb(var(--ui-accent) / 0.92) 0deg ${cut1}deg,
              rgb(var(--ui-danger) / 0.88) ${cut1}deg ${cut2}deg,
              var(--ring-track) ${cut2}deg 360deg
            )`,
            }}
        >
          <span className="ui-ring-meter-core">
            <span className="ui-ring-meter-value">{Math.round(green * 100)}%</span>
          </span>
        </span>

                <span className="min-w-0 text-left">
          <div className="ui-ring-button-title">{props.label}</div>
                    {props.sublabel ? <div className="ui-ring-button-subtitle">{props.sublabel}</div> : null}
        </span>
            </div>
        </button>
    );
}