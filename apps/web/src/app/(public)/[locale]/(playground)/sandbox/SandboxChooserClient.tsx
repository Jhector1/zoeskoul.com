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
    path:string;
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
            ? "ui-pill ui-pill--good"
            : tone === "warn"
                ? "ui-pill ui-pill--warn"
                : "ui-pill ui-pill--neutral";
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
                    "Run code, test ideas, and practice in one place (Python, Java, JS, C/C++…).",
                icon: <Code2 className="h-5 w-5" />,
                tags: ["Python", "Java", "JavaScript", "C", "C++"],
                path:"programming/python",
                badge: { text: "All languages", tone: "good" },

            },
            {
                slug: "sql",
                title: "SQL Playground",
                description:
                    "Write queries, learn joins/aggregations, and test answers against datasets.",
                icon: <Database className="h-5 w-5" />,
                tags: ["SELECT", "JOIN", "GROUP BY", "Views"],
                path:"programming/sql",

                badge: { text: "Query mode", tone: "neutral" },
            },
            {
                slug: "linear-algebra",
                title: "Linear Algebra Lab",
                path:"math/linear-algebra",

                description:
                    "Interactive vectors, matrices, transforms, and geometry sketches + practice.",
                icon: <Sigma className="h-5 w-5" />,
                tags: ["Vectors", "Matrices", "Transforms"],
                badge: { text: "Interactive", tone: "good" },
            },
            {
                slug: "tools",
                title: "More Tools",
                path:"programming/python",
                description:
                    "Extra sandboxes you’ll add over time: regex, stats, networking, notebooks, etc.",
                icon: <Sparkles className="h-5 w-5" />,
                tags: ["Coming soon", "Extensible"],
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
        router.push(`/sandbox/${opt.path}`);
    };

    const lastOpt = lastSlug ? options.find((o) => o.slug === lastSlug) : null;

    return (
        <div className="space-y-4">
            <div className="ui-surface">
                <div className="ui-surface-head">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <div className="ui-section-kicker">Sandbox</div>
                            <div className="ui-section-title">Choose your workspace</div>
                            <div className="ui-section-subtitle">
                                Pick a mode and start experimenting. One route: <span className="font-extrabold">/sandbox/[sandboxSlug]</span>.
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                {pill("neutral", resolvedTheme === "dark" ? "Dark mode" : "Light mode")}
                                {lastOpt ? pill("good", `Last used: ${lastOpt.slug}`) : pill("neutral", "No last selection yet")}
                            </div>
                        </div>

                        <div className="w-full md:w-[420px]">
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder='Search… (e.g., "joins", "python", "vectors")'
                                className="ui-search-input"
                            />

                            <div className="mt-3 flex items-center gap-2">
                                {lastOpt ? (
                                    <button type="button" className="ui-btn ui-btn-primary w-full" onClick={() => open(lastOpt)}>
                                        Continue {lastOpt.title}
                                    </button>
                                ) : (
                                    <button type="button" className="ui-btn ui-btn-secondary w-full" disabled>
                                        Continue
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {filtered.map((opt) => {
                            const isLast = lastSlug === opt.slug;

                            return (
                                <button
                                    key={opt.slug}
                                    type="button"
                                    onClick={() => open(opt)}
                                    className={cn("ui-tile group p-5", isLast && "ui-tile--active")}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            <div className="ui-tile-chip grid place-items-center">
                                                <div className="text-neutral-700 dark:text-white/80">{opt.icon}</div>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="text-base font-extrabold text-neutral-900 dark:text-white">
                                                        {opt.title}
                                                    </div>
                                                    {opt.badge ? pill(opt.badge.tone, opt.badge.text) : null}
                                                </div>

                                                <div className="text-sm font-semibold text-neutral-600 dark:text-white/70">
                                                    {opt.description}
                                                </div>
                                            </div>
                                        </div>

                                        <ArrowRight className="mt-1 h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 dark:text-white/40" />
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {opt.tags.map((t) => (
                                            <React.Fragment key={t}>{pill("neutral", t)}</React.Fragment>
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {!filtered.length ? (
                        <div className="ui-soft mt-4 p-4 text-sm font-semibold text-neutral-600 dark:text-white/70">
                            No matches. Try “python”, “joins”, or “vectors”.
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
