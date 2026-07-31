"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
    content?: string;
    children?: string;
    className?: string;
    inline?: boolean;
};

function cn(...cls: Array<string | false | null | undefined>) {
    return cls.filter(Boolean).join(" ");
}

export default function TextMarkdown({ content, children, className, inline = false }: Props) {
    const Wrapper: React.ElementType = inline ? "span" : "div";
    const md =
        (typeof content === "string"
            ? content
            : typeof children === "string"
                ? children
                : "") ?? "";

    return (
        <Wrapper className={cn(className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) =>
                        inline ? (
                            <>{children}</>
                        ) : (
                            <p className="my-2 leading-relaxed text-sm text-neutral-700 dark:text-white/80">
                                {children}
                            </p>
                        ),

                    strong: ({ children }) => <strong className="font-extrabold">{children}</strong>,

                    ul: ({ children }) =>
                        inline ? (
                            <>{children}</>
                        ) : (
                            <ul className="my-2 ml-5 list-disc text-sm text-neutral-700 dark:text-white/80">
                                {children}
                            </ul>
                        ),

                    ol: ({ children }) =>
                        inline ? (
                            <>{children}</>
                        ) : (
                            <ol className="my-2 ml-5 list-decimal text-sm text-neutral-700 dark:text-white/80">
                                {children}
                            </ol>
                        ),

                    li: ({ children }) =>
                        inline ? <>{children}</> : <li className="my-1">{children}</li>,

                    code: ({ className, children, ...props }) => {
                        const isBlock = typeof className === "string" && className.includes("language-");

                        if (!isBlock) {
                            return (
                                <code
                                    className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/90"
                                    {...props}
                                >
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code className={className} {...props}>
                                {children}
                            </code>
                        );
                    },

                    pre: ({ children }) => (
                        <pre className="ui-sketch-codeblock">
              <div className="ui-sketch-code">{children}</div>
            </pre>
                    ),

                    blockquote: ({ children }) => (
                        <blockquote className="my-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
                            {children}
                        </blockquote>
                    ),
                }}
            >
                {md}
            </ReactMarkdown>
        </Wrapper>
    );
}
