"use client";

import React from "react";
import BannerCard from "./BannerCard";

export default function TopicOutro({
                                       topic,
                                   }: {
    topic: any;
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
        />
    );
}