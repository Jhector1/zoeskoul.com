// src/components/markdown/MathMarkdown.tsx
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

type Props = {
    content: string;
    className?: string;
    /** Use inline when rendering inside buttons/labels (no <p> wrappers). */
    inline?: boolean;
};

function join(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

function nodeToText(node: React.ReactNode): string {
    if (node == null) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(nodeToText).join("");
    if (React.isValidElement(node)) return nodeToText((node.props as any).children);
    return "";
}

function CopyIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path d="M9 9h10v10H9V9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path
                d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
            <path
                d="M20 7L10 17l-4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function PreWithCopy({
                         children,
                         className,
                     }: {
    children: React.ReactNode;
    className?: string;
}) {
    const [copied, setCopied] = React.useState(false);
    const textToCopy = React.useMemo(() => nodeToText(children), [children]);

    async function onCopy() {
        const text = textToCopy.replace(/\n$/, "");
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.left = "-9999px";
                ta.style.top = "0";
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
            }
            setCopied(true);
            window.setTimeout(() => setCopied(false), 900);
        } catch {
            // silent
        }
    }

    const preClass = join(
        // ✅ theme-aware code surface
        "overflow-x-auto rounded-xl border p-3 pt-10 text-xs leading-relaxed font-mono",
        "border-neutral-200 bg-neutral-50 text-neutral-900",
        "dark:border-white/10 dark:bg-black/30 dark:text-white/85",

        // ✅ ensure highlight.js doesn't paint its own bg
        "[&_.hljs]:bg-transparent [&_.hljs]:p-0 [&_.hljs]:m-0",

        className,
    );

    const copyBtnClass = join(
        "absolute z-10 top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition",
        "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
        "dark:border-white/10 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/[0.10]",
        "focus:outline-none focus:ring-2 focus:ring-emerald-300/50",
    );

    return (
        <div className="relative z-0 my-3 w-full">
            <button
                type="button"
                onClick={onCopy}
                className={copyBtnClass}
                aria-label={copied ? "Copied" : "Copy code"}
                title={copied ? "Copied" : "Copy"}
            >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
            </button>

            <pre className={preClass}>{children}</pre>
        </div>
    );
}

// ------------------------------------------------------------
// ✅ Terminal-style markdown block renderer (~~~terminal)
// ------------------------------------------------------------
function TerminalExample({ raw }: { raw: string }) {
    const lines0 = String(raw ?? "").replace(/\n$/, "").split("\n");

    let meta = "Idle • Example";
    let lines = lines0;

    if (lines0[0]?.startsWith("@meta")) {
        const m = lines0[0].slice(5).trim();
        meta = m ? m.replace(/\s*\|\s*/g, " • ") : meta;
        lines = lines0.slice(1);
    }

    const metaLower = meta.toLowerCase();
    const isAccepted = metaLower.includes("accepted") || metaLower.includes("ok");
    const isError = metaLower.includes("error") || metaLower.includes("failed");

    const outerBorder = isError
        ? "border-rose-300/30"
        : isAccepted
            ? "border-emerald-300/30"
            : "border-neutral-200 dark:border-white/10";

    const innerBorder = isError
        ? "border-rose-300/20"
        : isAccepted
            ? "border-emerald-300/20"
            : "border-neutral-200 dark:border-white/10";

    const sysCls = "text-neutral-500 dark:text-white/60";
    const errCls = "font-semibold text-rose-600 dark:text-rose-300";
    const outCls = "text-neutral-900 dark:text-white/85";

    return (
        <div
            className={join(
                "relative z-0 my-3 w-full max-w-[760px] mx-auto",
                "rounded-2xl border p-3 bg-white/80 dark:bg-black/40",
                outerBorder,
            )}
        >
            <div className="flex items-center justify-between">
                <div className="text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                    Terminal
                </div>
                <div className="text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
                    {meta}
                </div>
            </div>

            <div
                className={join(
                    "mt-2 rounded-xl border p-2 max-h-48 overflow-auto",
                    "bg-white/60 dark:bg-black/30",
                    innerBorder,
                )}
            >
                <div className="font-mono text-xs leading-5 whitespace-pre-wrap px-2 break-words">
                    {lines.map((l, i) => {
                        const line = String(l ?? "");

                        const isSys =
                            line.startsWith("$") ||
                            line.startsWith(">") ||
                            line.toLowerCase().startsWith("input") ||
                            line.toLowerCase().startsWith("output");

                        const looksErr =
                            line.toLowerCase().includes("traceback") ||
                            line.toLowerCase().includes("error") ||
                            line.toLowerCase().includes("exception");

                        const cls = looksErr ? errCls : isSys ? sysCls : outCls;

                        return (
                            <React.Fragment key={i}>
                                <span className={cls}>{line}</span>
                                {i < lines.length - 1 ? "\n" : null}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function MathMarkdown({ content, className, inline = false }: Props) {
    const Wrapper: React.ElementType = inline ? "span" : "div";

    const wrapperClass = join(
        // ✅ ensures KaTeX inherits the surrounding text color
        "[&_.katex]:text-inherit [&_.katex-display]:overflow-x-auto",
        className,
    );

    return (
        <Wrapper className={wrapperClass}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[
                    rehypeKatex,
                    [rehypeHighlight, { detect: true, ignoreMissing: true }],
                ]}
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

                    li: ({ children }) => (inline ? <>{children}</> : <li className="my-1">{children}</li>),

                    code: ({ className, children, ...props }) => {
                        const isBlock = typeof className === "string" && className.includes("language-");

                        if (!isBlock) {
                            const text =
                                typeof children === "string"
                                    ? children
                                    : Array.isArray(children) && typeof children[0] === "string"
                                        ? children[0]
                                        : children;

                            return (
                                <code
                                    className={join(
                                        "rounded-md border px-1.5 py-0.5 font-mono text-[0.85em]",
                                        "border-neutral-200 bg-neutral-100 text-neutral-900",
                                        "dark:border-white/10 dark:bg-white/[0.06] dark:text-white/90",
                                    )}
                                    {...props}
                                >
                                    {text}
                                </code>
                            );
                        }

                        return (
                            <code className={className} {...props}>
                                {children}
                            </code>
                        );
                    },

                    pre: ({ children, className }) => {
                        if (inline) return <>{children}</>;

                        // Detect language from inner <code class="language-...">
                        let lang = "";
                        let codeNode: any = null;

                        if (React.isValidElement(children)) codeNode = children;
                        else if (Array.isArray(children) && React.isValidElement(children[0])) codeNode = children[0];

                        if (codeNode && React.isValidElement(codeNode)) {
                            lang = String((codeNode.props as any)?.className ?? "");
                        }

                        const isTerminal =
                            lang.includes("language-terminal") ||
                            lang.includes("language-learnoir-term") ||
                            lang.includes("language-console");

                        if (isTerminal) {
                            const raw = nodeToText(children);
                            return <TerminalExample raw={raw} />;
                        }

                        return <PreWithCopy className={className}>{children}</PreWithCopy>;
                    },

                    blockquote: ({ children }) => (
                        <blockquote className="my-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
                            {children}
                        </blockquote>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </Wrapper>
    );
}