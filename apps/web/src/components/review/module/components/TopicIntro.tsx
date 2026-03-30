"use client";

import React from "react";
import BannerCard from "./BannerCard";

export default function TopicIntro({ topic }: { topic: any }) {
    const intro = topic?.intro ?? null;
    const bullets: string[] = intro?.bullets ?? [];

    return (
        <BannerCard
            title={intro?.title ?? "Quick intro"}
            body={
                <div className="grid gap-2">
                    <div>{intro?.body ?? "Here’s what to focus on before you start."}</div>

                    {bullets.length ? (
                        <ul className="ui-review-banner-list">
                            {bullets.map((b) => (
                                <li key={b} className="ui-review-banner-item">
                                    <span className="ui-review-banner-mark">✓</span>
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