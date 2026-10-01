"use client";

import React from "react";
import { useTranslations } from "next-intl";
import RichMarkdownContent from "@/components/sketches/shared/RichMarkdownContent";
import {ParagraphSpec} from "@zoeskoul/learner-ui/sketches/subjects/specTypes";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import { LanguageAudioPlayer } from "@zoeskoul/learner-workspace/language/LanguageAudioPlayer";

export function ParagraphSketch({
    spec,
    showTitle = true,
}: {
    spec: ParagraphSpec;
    showTitle?: boolean;
}) {
    const md = (spec.bodyMarkdown ?? spec.text ?? "").trim();
    const hasVisibleTitle = Boolean(showTitle && spec.title);
    const audioT = useTranslations("languageAudio");

    return (
        <div>
            {hasVisibleTitle ? (
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                    {spec.title}
                </div>
            ) : null}

            <RichMarkdownContent
                content={md}
                images={spec.images}
                className={hasVisibleTitle ? "mt-2" : undefined}
                renderMarkdown={(content, key) => (
                    <MathMarkdown key={key} content={content} />
                )}
            />

            {spec.audio ? (
                <LanguageAudioPlayer
                    audio={spec.audio}
                    labels={{
                        listen: audioT("listen"),
                        playConversation: audioT(
                            "playConversation",
                        ),
                        stop: audioT("stop"),
                        replayLine: audioT(
                            "replayLine",
                        ),
                        loading: audioT(
                            "loading",
                        ),
                        speaking: audioT(
                            "speaking",
                        ),
                        unavailable: audioT(
                            "unavailable",
                        ),
                        autoListen: audioT("autoListen"),
                    }}
                />
            ) : null}
        </div>
    );
}
