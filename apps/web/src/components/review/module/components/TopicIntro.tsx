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
                        <ul className="mt-1 grid gap-1 text-sm">
                            {bullets.map((b) => (
                                <li key={b} className="flex gap-2">
                                    <span className="mt-[2px]">✓</span>
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
