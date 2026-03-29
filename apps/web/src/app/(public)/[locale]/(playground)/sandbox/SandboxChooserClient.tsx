"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Code2, Database, Sigma, Sparkles, ArrowRight } from "lucide-react";

type SandboxSlug = "programming" | "sql" | "linear-algebra" | "tools";

type SandboxOption = {
    slug: SandboxSlug;
    title: string;
    description: string;
    icon: React.ReactNode;
    path: string;
    tags: string[];
    badge?: { text: string; tone: "good" | "warn" | "neutral" };
};

const STORAGE_KEY = "learnoir:sandbox:lastSlug";

function cn(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

function pill(tone: "good" | "warn" | "neutral", text: string) {
    const cls =
        tone === "good"
            ? "ui-pill-good"
            : tone === "warn"
                ? "ui-pill-warn"
                : "ui-pill-neutral";

    return <span className={cls}>{text}</span>;
}

export default function SandboxChooserClient({ locale }: { locale: string }) {
    const router = useRouter();
    const { resolvedTheme } = useTheme();

    const [q, setQ] = React.useState("");
    const [lastSlug, setLastSlug] = React.useState<SandboxSlug | null>(null);

    React.useEffect(() => {
        try {
            const v = window.localStorage.getItem(STORAGE_KEY) as SandboxSlug | null;
            if (v) setLastSlug(v);
        } catch {}
    }, []);

    const options: SandboxOption[] = React.useMemo(
        () => [
            {
                slug: "programming",
                title: "Programming Sandbox",
                description:
                    "Run code, test ideas, and practice in one place.",
                icon: <Code2 className="h-4 w-4" />,
                tags: ["Python", "Java", "JavaScript", "C", "C++"],
                path: "programming/python",
                badge: { text: "All languages", tone: "good" },
            },
            {
                slug: "sql",
                title: "SQL Playground",
                description:
                    "Write queries, learn joins and aggregations, and test answers.",
                icon: <Database className="h-4 w-4" />,
                tags: ["SELECT", "JOIN", "GROUP BY", "Views"],
                path: "programming/sql",
                badge: { text: "Query mode", tone: "neutral" },
            },
            {
                slug: "linear-algebra",
                title: "Linear Algebra Lab",
                description:
                    "Interactive vectors, matrices, transforms, and geometry practice.",
                icon: <Sigma className="h-4 w-4" />,
                tags: ["Vectors", "Matrices", "Transforms"],
                path: "math/linear-algebra",
                badge: { text: "Interactive", tone: "good" },
            },
            {
                slug: "tools",
                title: "More Tools",
                description:
                    "Extra sandboxes you’ll add over time.",
                icon: <Sparkles className="h-4 w-4" />,
                tags: ["Coming soon", "Extensible"],
                path: "programming/python",
                badge: { text: "Expandable", tone: "warn" },
            },
        ],
        [],
    );

    const filtered = React.useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return options;

        return options.filter((o) => {
            const hay = `${o.title} ${o.description} ${o.tags.join(" ")}`.toLowerCase();
            return hay.includes(s);
        });
    }, [q, options]);

    const open = (opt: SandboxOption) => {
        try {
            window.localStorage.setItem(STORAGE_KEY, opt.slug);
            setLastSlug(opt.slug);
        } catch {}

        router.push(`/${locale}/sandbox/${opt.path}`);
    };

    const lastOpt = lastSlug ? options.find((o) => o.slug === lastSlug) : null;

    return (
        <div className="space-y-4">
            <div className="ui-page-surface overflow-hidden">
                <div className="border-b border-neutral-200 px-4 py-4 dark:border-white/10 sm:px-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="ui-kicker">Sandbox</div>
                            <div className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white/90">
                                Choose your workspace
                            </div>
                            <div className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-white/65">
                                Pick a mode and start experimenting.
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {pill("neutral", resolvedTheme === "dark" ? "Dark mode" : "Light mode")}
                                {lastOpt
                                    ? pill("good", `Last used: ${lastOpt.slug}`)
                                    : pill("neutral", "No last selection yet")}
                            </div>
                        </div>

                        <div className="w-full lg:w-[360px]">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder='Search: "joins", "python", "vectors"...'
                                className="ui-input-ide w-full"
                            />

                            <div className="mt-2">
                                {lastOpt ? (
                                    <button
                                        type="button"
                                        className="ui-btn-primary w-full"
                                        onClick={() => open(lastOpt)}
                                    >
                                        Continue {lastOpt.title}
                                    </button>
                                ) : (
                                    <button type="button" className="ui-btn-secondary w-full" disabled>
                                        Continue
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {filtered.map((opt) => {
                            const isLast = lastSlug === opt.slug;

                            return (
                                <button
                                    key={opt.slug}
                                    type="button"
                                    onClick={() => open(opt)}
                                    className={cn(
                                        "group ui-surface text-left p-4 transition-colors",
                                        isLast && "border-neutral-300 dark:border-white/15",
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <div className="ui-icon-box h-9 w-9">
                                                <div className="text-neutral-700 dark:text-white/80">{opt.icon}</div>
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="text-sm font-semibold text-neutral-900 dark:text-white/90">
                                                        {opt.title}
                                                    </div>
                                                    {opt.badge ? pill(opt.badge.tone, opt.badge.text) : null}
                                                </div>

                                                <div className="mt-1 text-sm text-neutral-600 dark:text-white/65">
                                                    {opt.description}
                                                </div>
                                            </div>
                                        </div>

                                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 dark:text-white/35" />
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {opt.tags.map((t) => (
                                            <React.Fragment key={t}>{pill("neutral", t)}</React.Fragment>
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {!filtered.length ? (
                        <div className="ui-surface-muted mt-3 p-4 text-sm text-neutral-600 dark:text-white/65">
                            No matches. Try “python”, “joins”, or “vectors”.
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}