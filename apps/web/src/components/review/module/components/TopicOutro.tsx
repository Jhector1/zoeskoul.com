"use client";

import React from "react";
import { cn } from "@/lib/cn";
import BannerCard from "./BannerCard";

export default function TopicOutro({
                                       topic,
                                       onContinue,
                                       continueLabel = "Continue",
                                   }: {
    topic: any;
    onContinue?: () => void;
    continueLabel?: string;
}) {
    const outro = topic?.outro ?? null;
    const bullets: string[] = outro?.bullets ?? [];

    return (
        <BannerCard
            tone="good"
            title={outro?.title ?? "Nice — topic complete"}
            body={
                <div className="grid gap-2">
                    <div>
                        {outro?.body ??
                            "You finished everything in this topic. You can move on or review anything you want."}
                    </div>

                    {bullets.length ? (
                        <ul className="ui-review-banner-list">
                            {bullets.map((b) => (
                                <li key={b} className="ui-review-banner-item">
                                    <span className="ui-review-banner-mark">•</span>
                                    <span>{b}</span>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            }
            actions={
                onContinue ? (
                    <button
                        type="button"
                        onClick={onContinue}
                        className={cn("ui-btn-primary px-4")}
                    >
                        {continueLabel} <span aria-hidden>→</span>
                    </button>
                ) : null
            }
        />
    );
}