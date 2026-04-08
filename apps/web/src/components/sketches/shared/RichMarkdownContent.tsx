"use client";

import React from "react";
import Image from "next/image";

export type RichContentImage = {
    src: string;
    alt: string;
    caption?: string;
    className?: string;
    figureClassName?: string;
    maxWidthClassName?: string;
    width?: number;
    height?: number;
};

export type RichContentImages = Record<string, RichContentImage>;

type RichContentPart =
    | { type: "markdown"; content: string; id: string }
    | { type: "image"; key: string; id: string };

const IMAGE_MARKER_RE = /\[\[image:([a-zA-Z0-9_-]+)\]\]/g;

function join(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

export function splitRichContent(content: string): RichContentPart[] {
    const source = String(content ?? "").trim();
    if (!source) return [];

    const parts: RichContentPart[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    IMAGE_MARKER_RE.lastIndex = 0;

    while ((match = IMAGE_MARKER_RE.exec(source)) !== null) {
        const fullMatch = match[0];
        const imageKey = match[1];
        const start = match.index;

        const before = source.slice(lastIndex, start).trim();
        if (before) {
            parts.push({
                type: "markdown",
                content: before,
                id: `md-${i++}`,
            });
        }

        parts.push({
            type: "image",
            key: imageKey,
            id: `img-${i++}`,
        });

        lastIndex = start + fullMatch.length;
    }

    const tail = source.slice(lastIndex).trim();
    if (tail) {
        parts.push({
            type: "markdown",
            content: tail,
            id: `md-${i++}`,
        });
    }

    return parts;
}

export function RichContentImageBlock({
                                          image,
                                      }: {
    image: RichContentImage;
}) {
    const width = image.width ?? 1600;
    const height = image.height ?? 900;

    return (
        <figure
            className={join(
                "my-4 w-full overflow-hidden rounded-2xl border ui-border ui-bg-surface-2",
                "mx-auto max-w-2xl",
                image.maxWidthClassName??"  max-w-sm",
                image.figureClassName,
            )}
        >
            <Image
                src={image.src}
                alt={image.alt}
                width={width}
                height={height}
                className={image.className ?? "block h-auto w-full object-cover"}
            />
            {image.caption ? (
                <figcaption className="px-4 py-3 text-xs ui-text-muted">
                    {image.caption}
                </figcaption>
            ) : null}
        </figure>
    );
}

export default function RichMarkdownContent(props: {
    content: string;
    images?: RichContentImages;
    renderMarkdown: (content: string, key: string) => React.ReactNode;
    emptyFallback?: React.ReactNode;
    missingImageFallback?: (key: string) => React.ReactNode;
    className?: string;
}) {
    const {
        content,
        images,
        renderMarkdown,
        emptyFallback = <span className="opacity-60">No text.</span>,
        missingImageFallback,
        className,
    } = props;

    const parts = splitRichContent(content);

    if (!parts.length) {
        return <>{emptyFallback}</>;
    }

    return (
        <div className={className}>
            {parts.map((part) => {
                if (part.type === "markdown") {
                    return renderMarkdown(part.content, part.id);
                }

                const image = images?.[part.key];
                if (!image) {
                    return missingImageFallback ? (
                        <React.Fragment key={part.id}>
                            {missingImageFallback(part.key)}
                        </React.Fragment>
                    ) : null;
                }

                return <RichContentImageBlock key={part.id} image={image} />;
            })}
        </div>
    );
}