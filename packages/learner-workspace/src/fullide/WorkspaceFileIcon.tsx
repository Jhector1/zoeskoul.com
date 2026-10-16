"use client";

import React from "react";
import {
    Box,
    Braces,
    Code2,
    Database,
    File,
    FileCode2,
    FileImage,
    FileText,
    GitBranch,
    Settings,
    Terminal,
} from "lucide-react";

export type WorkspaceFileIconKind =
    | "react"
    | "typescript"
    | "javascript"
    | "html"
    | "css"
    | "json"
    | "markdown"
    | "python"
    | "sql"
    | "shell"
    | "yaml"
    | "xml"
    | "image"
    | "text"
    | "git"
    | "env"
    | "docker"
    | "config"
    | "lock"
    | "generic";

function leafName(fileName: string) {
    return String(fileName ?? "")
        .trim()
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.toLowerCase() ?? "";
}

export function resolveWorkspaceFileIconKind(
    fileName: string,
): WorkspaceFileIconKind {
    const leaf = leafName(fileName);

    if (!leaf) return "generic";

    if (
        leaf === ".gitignore" ||
        leaf === ".gitattributes" ||
        leaf === ".gitmodules"
    ) {
        return "git";
    }

    if (
        leaf === "bun.lock" ||
        leaf === "bun.lockb" ||
        leaf === "pnpm-lock.yaml" ||
        leaf === "package-lock.json" ||
        leaf === "yarn.lock"
    ) {
        return "lock";
    }

    if (leaf === "dockerfile" || leaf.startsWith("dockerfile.")) {
        return "docker";
    }

    if (leaf === ".env" || leaf.startsWith(".env.")) {
        return "env";
    }

    if (
        leaf.startsWith("vite.config.") ||
        leaf.startsWith("next.config.") ||
        leaf.startsWith("webpack.config.") ||
        leaf.startsWith("eslint.config.") ||
        leaf.startsWith("tailwind.config.") ||
        leaf.startsWith("postcss.config.") ||
        leaf === ".prettierrc" ||
        leaf.startsWith(".prettierrc.") ||
        leaf === "tsconfig.json" ||
        leaf.startsWith("tsconfig.")
    ) {
        return "config";
    }

    const extension = leaf.includes(".") ? leaf.split(".").pop() ?? "" : "";

    if (["tsx", "jsx"].includes(extension)) return "react";
    if (["ts", "mts", "cts"].includes(extension)) return "typescript";
    if (["js", "mjs", "cjs"].includes(extension)) return "javascript";
    if (["html", "htm"].includes(extension)) return "html";
    if (["css", "scss", "sass", "less"].includes(extension)) return "css";
    if (["json", "jsonc"].includes(extension)) return "json";
    if (["md", "mdx"].includes(extension)) return "markdown";
    if (["py", "pyi"].includes(extension)) return "python";
    if (extension === "sql") return "sql";
    if (["sh", "bash", "zsh", "fish"].includes(extension)) return "shell";
    if (["yaml", "yml"].includes(extension)) return "yaml";
    if (extension === "xml") return "xml";
    if (
        ["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "svg"].includes(
            extension,
        )
    ) {
        return "image";
    }
    if (["txt", "log"].includes(extension)) return "text";

    return "generic";
}

type IconProps = {
    className?: string;
};

function ReactAtomIcon({ className }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
            <ellipse cx="12" cy="12" rx="9.2" ry="3.55" />
            <ellipse cx="12" cy="12" rx="9.2" ry="3.55" transform="rotate(60 12 12)" />
            <ellipse cx="12" cy="12" rx="9.2" ry="3.55" transform="rotate(120 12 12)" />
        </svg>
    );
}

function TypeScriptIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
            <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />
            <path
                d="M7 9.3h6.1v2H11.2V17H8.9v-5.7H7v-2Zm6.9 6.5 1.1-1.3c.75.62 1.52.94 2.3.94.64 0 1.03-.24 1.03-.66 0-.4-.29-.59-1.43-.91-1.55-.4-2.56-.84-2.56-2.42 0-1.43 1.14-2.38 2.75-2.38 1.13 0 2.09.35 2.88.98l-.97 1.39c-.69-.48-1.36-.76-1.93-.76-.6 0-.91.27-.91.61 0 .47.3.62 1.53.94 1.57.41 2.46.98 2.46 2.38 0 1.57-1.2 2.45-2.89 2.45a5.02 5.02 0 0 1-3.36-1.22Z"
                fill="white"
            />
        </svg>
    );
}

function JavaScriptIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
            <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />
            <path
                d="M7.25 8.6h2.15v6.06c0 2.06-1.18 3.06-3.02 3.06-.46 0-.94-.08-1.3-.2v-1.74c.28.08.57.12.87.12.85 0 1.3-.38 1.3-1.36V8.6Zm3.25 7.77 1.12-1.37c.72.61 1.47.93 2.26.93.64 0 1.02-.24 1.02-.66 0-.39-.28-.58-1.4-.88-1.5-.39-2.49-.84-2.49-2.39 0-1.4 1.12-2.34 2.69-2.34 1.1 0 2.03.34 2.8.96l-.95 1.36c-.67-.47-1.32-.74-1.88-.74-.58 0-.88.27-.88.6 0 .45.29.6 1.49.91 1.53.4 2.4.96 2.4 2.33 0 1.53-1.17 2.4-2.82 2.4a4.9 4.9 0 0 1-3.27-1.11Z"
                fill="#111827"
            />
        </svg>
    );
}

function CssShieldIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
            <path d="M5 3h14l-1.35 15.3L12 21l-5.65-2.7L5 3Z" fill="currentColor" />
            <path
                d="M8 7h8l-.2 2H10l.15 1.7h5.5l-.4 4.25L12 16.4l-3.2-1.45-.2-2.15h2l.08.8 1.32.6 1.35-.6.12-1H8.3L8 7Z"
                fill="white"
            />
        </svg>
    );
}

function HtmlIcon({ className }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m9 7-5 5 5 5" />
            <path d="m15 7 5 5-5 5" />
            <path d="m13 5-2 14" />
        </svg>
    );
}

function MarkdownIcon({ className }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
            <path d="M6 15V9l2.5 3L11 9v6" />
            <path d="M15 10v5" />
            <path d="m13.2 13.2 1.8 1.8 1.8-1.8" />
        </svg>
    );
}

function PythonIcon({ className }: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 3c-4.2 0-4 1.8-4 1.8V8h4v1H6.6S3 8.6 3 13s3.2 4.2 3.2 4.2H8V14c0-1.6 1.3-3 3-3h5c1.7 0 3-1.4 3-3V5.8S19.3 3 12 3Z" />
            <circle cx="10" cy="5.8" r=".75" fill="currentColor" stroke="none" />
            <path d="M12 21c4.2 0 4-1.8 4-1.8V16h-4v-1h5.4S21 15.4 21 11s-3.2-4.2-3.2-4.2H16V10c0 1.6-1.3 3-3 3H8c-1.7 0-3 1.4-3 3v2.2S4.7 21 12 21Z" />
            <circle cx="14" cy="18.2" r=".75" fill="currentColor" stroke="none" />
        </svg>
    );
}

function iconClass(extra?: string) {
    return ["h-4 w-4 shrink-0", extra ?? ""].filter(Boolean).join(" ");
}

export default function WorkspaceFileIcon(props: {
    fileName: string;
    className?: string;
}) {
    const kind = resolveWorkspaceFileIconKind(props.fileName);
    const className = iconClass(props.className);

    const icon = (() => {
        switch (kind) {
            case "react":
                return <ReactAtomIcon className={`${className} text-cyan-500 dark:text-cyan-300`} />;
            case "typescript":
                return <TypeScriptIcon className={`${className} text-blue-600 dark:text-blue-400`} />;
            case "javascript":
                return <JavaScriptIcon className={`${className} text-yellow-400 dark:text-yellow-300`} />;
            case "html":
                return <HtmlIcon className={`${className} text-orange-600 dark:text-orange-400`} />;
            case "css":
                return <CssShieldIcon className={`${className} text-blue-500 dark:text-blue-400`} />;
            case "json":
                return <Braces className={`${className} text-amber-600 dark:text-amber-400`} />;
            case "markdown":
                return <MarkdownIcon className={`${className} text-slate-600 dark:text-slate-300`} />;
            case "python":
                return <PythonIcon className={`${className} text-indigo-600 dark:text-yellow-300`} />;
            case "sql":
                return <Database className={`${className} text-violet-600 dark:text-violet-400`} />;
            case "shell":
                return <Terminal className={`${className} text-emerald-600 dark:text-emerald-400`} />;
            case "yaml":
                return <FileCode2 className={`${className} text-rose-600 dark:text-rose-400`} />;
            case "xml":
                return <Code2 className={`${className} text-orange-500 dark:text-orange-400`} />;
            case "image":
                return <FileImage className={`${className} text-fuchsia-600 dark:text-fuchsia-400`} />;
            case "text":
                return <FileText className={`${className} text-neutral-500 dark:text-neutral-400`} />;
            case "git":
                return <GitBranch className={`${className} text-orange-600 dark:text-orange-400`} />;
            case "env":
                return <Settings className={`${className} text-lime-600 dark:text-lime-400`} />;
            case "docker":
                return <Box className={`${className} text-sky-600 dark:text-sky-400`} />;
            case "config":
                return <Settings className={`${className} text-purple-600 dark:text-purple-400`} />;
            case "lock":
                return <Box className={`${className} text-amber-700 dark:text-amber-400`} />;
            case "generic":
            default:
                return <File className={`${className} text-neutral-500 dark:text-neutral-400`} />;
        }
    })();

    return (
        <span
            aria-hidden="true"
            data-workspace-file-icon={kind}
            className="inline-grid shrink-0 place-items-center"
        >
            {icon}
        </span>
    );
}
