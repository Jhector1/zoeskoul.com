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

    const frameClass = join(
        "relative my-3 w-full overflow-hidden rounded-md border",
        "border-white/10 bg-[#020817]",
    );

    const preClass = join(
        "m-0 overflow-x-auto bg-transparent p-4 pr-14 text-xs leading-relaxed font-mono text-white",
        "rounded-none border-0",
        "[&>code]:block [&>code]:min-w-full",
        "[&>code]:!bg-transparent [&>code]:!p-0 [&>code]:!m-0",
        "[&>code.hljs]:!bg-transparent [&>code.hljs]:!p-0 [&>code.hljs]:!m-0",
        className,
    );

    const copyBtnClass = join(
        "absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md",
        "border border-white/10 bg-white/5 text-white/70 transition-colors",
        "hover:bg-white/10 hover:text-white",
        "focus:outline-none focus:ring-2 focus:ring-white/20",
    );

    return (
        <div className={frameClass}>
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

    const outerCls = isError
        ? "ui-surface-danger"
        : isAccepted
            ? "ui-surface-success"
            : "ui-page-surface";

    const innerCls = isError
        ? "ui-border-danger ui-bg-danger-soft"
        : isAccepted
            ? "ui-border-accent ui-bg-accent-soft"
            : " ui-surface";

    const sysCls = "ui-text-soft";
    const errCls = "ui-text-danger font-medium";
    const outCls = "ui-text";

    return (
        <div className={join("ui-surface relative z-0 my-3 mx-auto w-full max-w-[760px] p-3", outerCls, "rounded-none")}>
            <div className="flex items-center justify-between gap-2">
                <div className="ui-meta-strong">Terminal</div>
                <div className="ui-meta">{meta}</div>
            </div>

            <div className={join("mt-2 max-h-48 overflow-auto ","border-none")}>
                <div className="whitespace-pre-wrap break-words px-2 font-mono text-xs leading-5">
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
                            <p className="my-2 text-sm  leading-relaxed ui-text-muted">
                                {children}
                            </p>
                        ),

                    strong: ({ children }) => <strong className="font-semibold ui-text">{children}</strong>,

                    ul: ({ children }) =>
                        inline ? (
                            <>{children}</>
                        ) : (
                            <ul className="my-2 ml-5 list-disc text-sm ui-text-muted">
                                {children}
                            </ul>
                        ),

                    ol: ({ children }) =>
                        inline ? (
                            <>{children}</>
                        ) : (
                            <ol className="my-2 ml-5 list-decimal text-sm ui-text-muted">
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
                                        "ui-border ui-bg-surface-2 ui-text",
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
                        <blockquote className="my-2 ui-surface-muted p-3 text-sm ui-text-muted">
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