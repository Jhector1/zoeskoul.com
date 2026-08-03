"use client";

import React from "react";
import { useTaggedT } from "@/i18n/tagged";

export default function TopicShell(props: {
    title?: string;
    subtitle?: string | null;
    right?: React.ReactNode;
    progress?: React.ReactNode;
    children: React.ReactNode;
}) {
    const { right, progress, children } = props;
    const tt = useTaggedT();

    const title = tt.resolve(props.title ?? "");
    const subtitle = tt.resolve(props.subtitle ?? null);

    return (
        <section className="flex min-h-full flex-col">
            <div
                className="sticky top-0 z-30 isolate shrink-0"
                data-testid="review-topic-sticky-header"
            >
                <div
                    style={{
                        backgroundColor: "rgb(var(--ui-bg) / 1)",
                    }}
                >
                    <div className="ui-review-topic-shell">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="ui-review-topic-shell-title">{title}</div>

                                {subtitle ? (
                                    <div className="ui-review-topic-shell-subtitle">{subtitle}</div>
                                ) : null}
                            </div>

                            {right ? <div className="ui-review-topic-shell-right">{right}</div> : null}
                        </div>

                        {progress}
                    </div>
                </div>
            </div>

            <div className="relative z-0 flex min-h-0 flex-1 flex-col">
                {children}
            </div>
        </section>
    );
}
