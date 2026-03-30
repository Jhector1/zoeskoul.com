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
                                            desktop = false,
                                        }: {
    docTitle: string;
    sections: SectionItem[];
    desktop?: boolean;
}) {
    const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
    const [marker, setMarker] = useState({ top: 0, height: 0, ready: false });

    const listRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
    }, [activeId, sections]);

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
                    setActiveId(visible[0].target.id);
                    return;
                }

                const passed = elements.filter(
                    (el) => el.getBoundingClientRect().top <= 140,
                );
                if (passed.length) {
                    setActiveId(passed[passed.length - 1].id);
                }
            },
            {
                root: null,
                rootMargin: "-120px 0px -55% 0px",
                threshold: [0, 0.1, 0.25, 0.5, 0.75],
            },
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

    function handleJump(id: string) {
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
        <div className="self-start">
            <div className="ui-meta pb-3">
                <Link href="/legal" className="hover:text-[rgb(var(--ui-text)/0.96)]">
                    Legal
                </Link>
                <span className="mx-2">/</span>
                <span className="text-[rgb(var(--ui-text)/0.96)]">{docTitle}</span>
            </div>

            <div
                className={cn(
                    "ui-page-surface p-4",
                    desktop && "max-h-[calc(100vh-7rem)] overflow-y-auto",
                )}
            >
                <div className="ui-kicker">On this page</div>
                <div className="mt-1 ui-title-sm">{docTitle}</div>

                <div ref={listRef} className="relative mt-4">
                    <div
                        aria-hidden="true"
                        className={cn(
                            "ui-surface-soft pointer-events-none absolute left-0 right-0 z-0 rounded-lg transition-[transform,height,opacity] duration-300 ease-out",
                            marker.ready ? "opacity-100" : "opacity-0",
                        )}
                        style={{
                            transform: `translateY(${marker.top}px)`,
                            height: `${marker.height}px`,
                        }}
                    />

                    <div className="relative z-10 space-y-1.5">
                        {sections.map((section) => {
                            const active = activeId === section.id;

                            return (
                                <button
                                    key={section.id}
                                    ref={(el) => {
                                        itemRefs.current[section.id] = el;
                                    }}
                                    type="button"
                                    aria-current={active ? "location" : undefined}
                                    onClick={() => handleJump(section.id)}
                                    className={cn(
                                        "relative flex min-h-10 w-full items-center rounded-lg px-3 py-2 pl-5 text-left text-sm leading-5 transition-colors duration-200",
                                        active
                                            ? "text-[rgb(var(--ui-text)/0.96)]"
                                            : "text-[rgb(var(--ui-text-muted)/0.9)] hover:text-[rgb(var(--ui-text)/0.96)]",
                                    )}
                                >
                  <span
                      className={cn(
                          "absolute left-2 top-1/2 h-5 -translate-y-1/2 rounded-full transition-all duration-300 ease-out",
                          active
                              ? "w-1.5 bg-[rgb(var(--ui-text)/0.96)]"
                              : "w-1 bg-[rgb(var(--ui-border-strong)/1)]",
                      )}
                  />
                                    <span>{section.title}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}