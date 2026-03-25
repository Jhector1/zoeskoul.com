"use client";

import React from "react";
import { cn } from "@/lib/cn";
import BannerCard from "./BannerCard";

export default function TopicOutro({
                                       topic,
                                       onContinue,
                                   }: {
    topic: any;
    onContinue?: () => void;
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
                        <ul className="mt-1 grid gap-1 text-sm">
                            {bullets.map((b) => (
                                <li key={b} className="flex gap-2">
                                    <span className="mt-[2px]">•</span>
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
                        className={cn("ui-btn ui-btn-primary", "px-4 py-2 text-sm font-extrabold")}
                    >
                        Next topic →
                    </button>
                ) : null
            }
        />
    );
}
