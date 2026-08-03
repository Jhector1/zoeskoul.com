"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export type LessonMarkdownProps = {
  content: string;
  className?: string;
  inline?: boolean;
};

export type TerminalExampleLine = {
  text: string;
  kind: "system" | "error" | "output";
};

export type TerminalExampleModel = {
  meta: string;
  status: "idle" | "accepted" | "error";
  lines: TerminalExampleLine[];
};

const LITERAL_OPERATOR_CHARACTERS = new Set(
  Array.from(
    "><|&;~^%$@#*+=!?:.,/\\\\()[]{}_-",
  ),
);

function joinClasses(
  ...values: Array<
    string | false | null | undefined
  >
): string {
  return values.filter(Boolean).join(" ");
}

function nodeToText(
  node: React.ReactNode,
): string {
  if (node == null) return "";

  if (
    typeof node === "string" ||
    typeof node === "number"
  ) {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeToText).join("");
  }

  if (React.isValidElement(node)) {
    return nodeToText(
      (
        node.props as {
          children?: React.ReactNode;
        }
      ).children,
    );
  }

  return "";
}

export function shouldRenderLiteralOperatorContent(
  content: string,
): boolean {
  const value = String(content ?? "").trim();

  if (!value || value.includes("`")) {
    return false;
  }

  return Array.from(value).every(
    (character) =>
      LITERAL_OPERATOR_CHARACTERS.has(character),
  );
}

export function safeMarkdownUrl(
  rawUrl: string,
): string {
  const value = String(rawUrl ?? "").trim();

  if (!value) return "";

  if (value.startsWith("//")) {
    return "";
  }

  if (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("#") ||
    !/^[a-z][a-z\d+.-]*:/i.test(value)
  ) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();

    if (
      protocol === "http:" ||
      protocol === "https:" ||
      protocol === "mailto:" ||
      protocol === "tel:"
    ) {
      return value;
    }
  } catch {
    return "";
  }

  return "";
}

export function parseTerminalExample(
  raw: string,
): TerminalExampleModel {
  const sourceLines = String(raw ?? "")
    .replace(/\n$/, "")
    .split("\n");

  let meta = "Idle • Example";
  let lines = sourceLines;

  if (sourceLines[0]?.startsWith("@meta")) {
    const authoredMeta =
      sourceLines[0].slice(5).trim();

    if (authoredMeta) {
      meta = authoredMeta.replace(
        /\s*\|\s*/g,
        " • ",
      );
    }

    lines = sourceLines.slice(1);
  }

  const normalizedMeta = meta.toLowerCase();
  const status = (
    normalizedMeta.includes("accepted") ||
    normalizedMeta.includes("ok")
  )
    ? "accepted"
    : (
        normalizedMeta.includes("error") ||
        normalizedMeta.includes("failed")
      )
      ? "error"
      : "idle";

  return {
    meta,
    status,
    lines: lines.map((line) => {
      const normalized = line.toLowerCase();
      const error =
        normalized.includes("traceback") ||
        normalized.includes("error") ||
        normalized.includes("exception");

      const system =
        line.startsWith("$") ||
        line.startsWith(">") ||
        normalized.startsWith("input") ||
        normalized.startsWith("output");

      return {
        text: line,
        kind: error
          ? "error"
          : system
            ? "system"
            : "output",
      };
    }),
  };
}

async function writeClipboardText(
  text: string,
): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (
    typeof document === "undefined"
  ) {
    throw new Error(
      "Clipboard access is unavailable.",
    );
  }

  const textarea =
    document.createElement("textarea");

  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied =
    document.execCommand("copy");

  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error(
      "The browser rejected the copy request.",
    );
  }
}

function CopyIcon(
  props: React.SVGProps<SVGSVGElement>,
) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M9 9h10v10H9V9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon(
  props: React.SVGProps<SVGSVGElement>,
) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M20 7 10 17l-4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function codeLanguage(
  children: React.ReactNode,
): string {
  const firstChild = Array.isArray(children)
    ? children[0]
    : children;

  if (!React.isValidElement(firstChild)) {
    return "";
  }

  const className = String(
    (
      firstChild.props as {
        className?: unknown;
      }
    ).className ?? "",
  );

  const match = className.match(
    /(?:^|\s)language-([^\s]+)/,
  );

  return match?.[1] ?? "";
}

function languageLabel(
  language: string,
): string {
  const value = language.trim();

  if (!value) return "Code";

  const aliases: Record<string, string> = {
    bash: "Bash",
    c: "C",
    console: "Terminal",
    cpp: "C++",
    css: "CSS",
    html: "HTML",
    javascript: "JavaScript",
    js: "JavaScript",
    json: "JSON",
    jsx: "JSX",
    "learnoir-term": "Terminal",
    markdown: "Markdown",
    md: "Markdown",
    python: "Python",
    py: "Python",
    shell: "Shell",
    sh: "Shell",
    sql: "SQL",
    terminal: "Terminal",
    ts: "TypeScript",
    tsx: "TSX",
    typescript: "TypeScript",
  };

  return aliases[value.toLowerCase()] ?? value;
}

function CodeFrame(props: {
  children: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] =
    React.useState(false);
  const textToCopy = React.useMemo(
    () => nodeToText(props.children),
    [props.children],
  );
  const language =
    codeLanguage(props.children);

  async function onCopy() {
    const text = textToCopy.replace(/\n$/, "");

    try {
      await writeClipboardText(text);
      setCopied(true);
      window.setTimeout(
        () => setCopied(false),
        900,
      );
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="zoe-code-frame">
      <div className="zoe-code-toolbar">
        <span className="zoe-code-language">
          {languageLabel(language)}
        </span>

        <button
          type="button"
          className="zoe-code-copy"
          onClick={() => void onCopy()}
          aria-label={
            copied ? "Copied" : "Copy code"
          }
          title={
            copied ? "Copied" : "Copy code"
          }
        >
          {copied ? (
            <CheckIcon />
          ) : (
            <CopyIcon />
          )}
          <span aria-live="polite">
            {copied ? "Copied" : "Copy"}
          </span>
        </button>
      </div>

      <pre className={props.className}>
        {props.children}
      </pre>
    </div>
  );
}

function TerminalExample(props: {
  raw: string;
}) {
  const model = React.useMemo(
    () => parseTerminalExample(props.raw),
    [props.raw],
  );

  return (
    <section
      className={joinClasses(
        "zoe-terminal-example",
        `is-${model.status}`,
      )}
    >
      <header>
        <strong>Terminal</strong>
        <span>{model.meta}</span>
      </header>

      <pre>
        {model.lines.map((line, index) => (
          <React.Fragment key={index}>
            <span
              className={`is-${line.kind}`}
            >
              {line.text}
            </span>
            {index < model.lines.length - 1
              ? "\n"
              : null}
          </React.Fragment>
        ))}
      </pre>
    </section>
  );
}

export function LessonMarkdown(
  props: LessonMarkdownProps,
) {
  const Wrapper: React.ElementType =
    props.inline ? "span" : "div";

  const rootClassName = joinClasses(
    "zoe-lesson-markdown",
    props.inline && "is-inline",
    props.className,
  );

  if (
    shouldRenderLiteralOperatorContent(
      props.content,
    )
  ) {
    return (
      <Wrapper className={rootClassName}>
        <code className="zoe-inline-code">
          {String(props.content).trim()}
        </code>
      </Wrapper>
    );
  }

  return (
    <Wrapper className={rootClassName}>
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
        ]}
        rehypePlugins={[
          rehypeKatex,
          [
            rehypeHighlight,
            {
              detect: true,
              ignoreMissing: true,
            },
          ],
        ]}
        skipHtml
        urlTransform={safeMarkdownUrl}
        components={{
          p: ({ children }) =>
            props.inline ? (
              <>{children}</>
            ) : (
              <p>{children}</p>
            ),

          ul: ({ children }) =>
            props.inline ? (
              <>{children}</>
            ) : (
              <ul>{children}</ul>
            ),

          ol: ({ children }) =>
            props.inline ? (
              <>{children}</>
            ) : (
              <ol>{children}</ol>
            ),

          li: ({ children }) =>
            props.inline ? (
              <>{children}</>
            ) : (
              <li>{children}</li>
            ),

          a: ({
            href,
            children,
            node: _node,
            ...anchorProps
          }) => {
            const external =
              typeof href === "string" &&
              /^https?:\/\//i.test(href);

            return (
              <a
                {...anchorProps}
                href={href}
                target={
                  external ? "_blank" : undefined
                }
                rel={
                  external
                    ? "noopener noreferrer"
                    : undefined
                }
              >
                {children}
              </a>
            );
          },

          code: ({
            className,
            children,
            node: _node,
            ...codeProps
          }) => {
            const block =
              typeof className === "string" &&
              className.includes("language-");

            if (block) {
              return (
                <code
                  className={className}
                  {...codeProps}
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                className="zoe-inline-code"
                {...codeProps}
              >
                {children}
              </code>
            );
          },

          pre: ({
            children,
            className,
            node: _node,
          }) => {
            if (props.inline) {
              return <>{children}</>;
            }

            const language =
              codeLanguage(children);
            const terminal =
              language === "terminal" ||
              language === "console" ||
              language === "learnoir-term";

            if (terminal) {
              return (
                <TerminalExample
                  raw={nodeToText(children)}
                />
              );
            }

            return (
              <CodeFrame className={className}>
                {children}
              </CodeFrame>
            );
          },
        }}
      >
        {props.content}
      </ReactMarkdown>
    </Wrapper>
  );
}

export default LessonMarkdown;
