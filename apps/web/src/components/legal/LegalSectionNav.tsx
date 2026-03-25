"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

type SectionItem = {
    id: string;
    title: string;
};

export default function LegalSectionNav({
                                            docTitle,
                                            sections,
                                        }: {
    docTitle: string;
    sections: SectionItem[];
}) {
    const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
    const [marker, setMarker] = useState({ top: 0, height: 0, ready: false });

    const listRef = useRef<HTMLUListElement | null>(null);
    const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

    const ids = useMemo(() => sections.map((s) => s.id), [sections]);

    function prefersReducedMotion() {
        if (typeof window === "undefined") return false;
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function updateMarker(nextId?: string) {
        const id = nextId ?? activeId;
        const listEl = listRef.current;
        const itemEl = itemRefs.current[id];

        if (!listEl || !itemEl) return;

        const listRect = listEl.getBoundingClientRect();
        const itemRect = itemEl.getBoundingClientRect();

        setMarker({
            top: itemRect.top - listRect.top,
            height: itemRect.height,
            ready: true,
        });
    }

    useLayoutEffect(() => {
        updateMarker();
    }, [activeId, sections.length]);

    useEffect(() => {
        const listEl = listRef.current;
        if (!listEl) return;

        const ro = new ResizeObserver(() => updateMarker());
        ro.observe(listEl);

        Object.values(itemRefs.current).forEach((el) => {
            if (el) ro.observe(el);
        });

        const handleResize = () => updateMarker();

        window.addEventListener("resize", handleResize);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", handleResize);
        };
    }, [activeId]);

    useEffect(() => {
        if (!ids.length) return;

        const elements = ids
            .map((id) => document.getElementById(id))
            .filter(Boolean) as HTMLElement[];

        if (!elements.length) return;

        const hash = window.location.hash.replace("#", "");
        if (hash && ids.includes(hash)) {
            setActiveId(hash);
            requestAnimationFrame(() => updateMarker(hash));
        } else if (elements[0]) {
            setActiveId(elements[0].id);
            requestAnimationFrame(() => updateMarker(elements[0].id));
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => {
                        const aTop = Math.abs(a.boundingClientRect.top);
                        const bTop = Math.abs(b.boundingClientRect.top);
                        return aTop - bTop;
                    });

                if (visible[0]?.target?.id) {
                    const id = visible[0].target.id;
                    setActiveId(id);
                    return;
                }

                const passed = elements.filter((el) => el.getBoundingClientRect().top <= 140);
                if (passed.length) {
                    setActiveId(passed[passed.length - 1].id);
                }
            },
            {
                root: null,
                rootMargin: "-120px 0px -55% 0px",
                threshold: [0, 0.1, 0.25, 0.5, 0.75],
            }
        );

        elements.forEach((el) => observer.observe(el));

        const onHashChange = () => {
            const nextHash = window.location.hash.replace("#", "");
            if (nextHash && ids.includes(nextHash)) {
                setActiveId(nextHash);
                requestAnimationFrame(() => updateMarker(nextHash));
            }
        };

        window.addEventListener("hashchange", onHashChange);

        return () => {
            observer.disconnect();
            window.removeEventListener("hashchange", onHashChange);
        };
    }, [ids]);

    function handleJump(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
        e.preventDefault();

        const el = document.getElementById(id);
        if (!el) return;

        setActiveId(id);
        updateMarker(id);

        el.scrollIntoView({
            behavior: prefersReducedMotion() ? "auto" : "smooth",
            block: "start",
            inline: "nearest",
        });

        window.history.replaceState(null, "", `#${id}`);
    }

    return (
        <aside className="sticky top-28 hidden self-start lg:block">
            <nav aria-label="Breadcrumb" className="py-2 text-sm text-neutral-500 dark:text-white/45">
                <Link href="/legal" className="hover:text-neutral-800 dark:hover:text-white">
                    Legal
                </Link>
                <span className="mx-2">/</span>
                <span className="text-neutral-900 dark:text-white">{docTitle}</span>
            </nav>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-500 dark:text-white/45">
                    On this page
                </p>

                <div className="relative mt-3">
                    <div
                        aria-hidden="true"
                        className={cn(
                            "pointer-events-none absolute left-0 right-0 z-0 rounded-xl border border-neutral-200/80 bg-neutral-100/90 shadow-sm transition-[transform,height,opacity] duration-300 ease-out dark:border-white/10 dark:bg-white/10",
                            marker.ready ? "opacity-100" : "opacity-0"
                        )}
                        style={{
                            transform: `translateY(${marker.top}px)`,
                            height: `${marker.height}px`,
                        }}
                    />

                    <ul ref={listRef} className="relative space-y-1.5">
                        {sections.map((section) => {
                            const active = activeId === section.id;

                            return (
                                <li key={section.id} className="relative z-10">
                                    <a
                                        ref={(el) => {
                                            itemRefs.current[section.id] = el;
                                        }}
                                        href={`#${section.id}`}
                                        aria-current={active ? "location" : undefined}
                                        onClick={(e) => handleJump(e, section.id)}
                                        className={cn(
                                            "group relative flex min-h-10 items-center rounded-xl px-3 py-2 pl-5 text-sm leading-5 transition-colors duration-200",
                                            active
                                                ? "text-neutral-950 dark:text-white"
                                                : "text-neutral-700 hover:text-neutral-900 dark:text-white/70 dark:hover:text-white"
                                        )}
                                    >
                    <span
                        className={cn(
                            "absolute left-2 top-1/2 h-5 -translate-y-1/2 rounded-full transition-all duration-300 ease-out",
                            active
                                ? "w-1.5 bg-neutral-900 dark:bg-white"
                                : "w-1 bg-neutral-300 group-hover:bg-neutral-400 dark:bg-white/15 dark:group-hover:bg-white/35"
                        )}
                    />
                                        <span className="block">{section.title}</span>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </aside>
    );
}