"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils";
import { IconDots } from "./icons";
import { WorkspaceLanguage } from "@/lib/practice/types";

export type MenuAction = {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
};

type NodeMenuProps = {
    actions: MenuAction[];

    /**
     * Default mode: render the kebab trigger button and manage open internally.
     */
    trigger?: "button" | "none";

    /**
     * Controlled open state for context-menu usage.
     */
    open?: boolean;
    onOpenChange?: (next: boolean) => void;

    /**
     * For context-menu usage, anchor the menu to a viewport point.
     */
    anchorPoint?: { x: number; y: number } | null;
};

export default function NodeMenu(props: NodeMenuProps) {
    const {
        actions,
        trigger = "button",
        open: controlledOpen,
        onOpenChange,
        anchorPoint = null,
    } = props;

    const isControlled = typeof controlledOpen === "boolean";
    const [internalOpen, setInternalOpen] = useState(false);
    const open = isControlled ? controlledOpen : internalOpen;

    const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
        const resolved =
            typeof next === "function"
                ? next(isControlled ? !!controlledOpen : internalOpen)
                : next;

        if (!isControlled) {
            setInternalOpen(resolved);
        }

        onOpenChange?.(resolved);
    };

    const [mounted, setMounted] = useState(false);
    const [pos, setPos] = useState<{
        top: number;
        left: number;
        width: number;
    } | null>(null);

    const btnRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const menuId = useId();

    const enabledIndexes = useMemo(
        () =>
            actions
                .map((a, i) => ({ a, i }))
                .filter((x) => !x.a.disabled)
                .map((x) => x.i),
        [actions],
    );

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open || !mounted) return;

        const update = () => {
            const width =
                window.innerWidth < 640
                    ? Math.min(208, window.innerWidth - 24)
                    : 220;

            const estimatedHeight = Math.min(
                Math.max(actions.length, 1) * 42 + 12,
                320,
            );

            if (anchorPoint) {
                const left = Math.max(
                    12,
                    Math.min(window.innerWidth - width - 12, anchorPoint.x),
                );
                const top = Math.max(
                    12,
                    Math.min(window.innerHeight - estimatedHeight - 12, anchorPoint.y),
                );

                setPos({ top, left, width });
                return;
            }

            const b = btnRef.current;
            if (!b) return;

            const r = b.getBoundingClientRect();
            const spaceBelow = window.innerHeight - r.bottom;
            const openUpward =
                spaceBelow < estimatedHeight + 12 && r.top > estimatedHeight;

            const top = openUpward
                ? Math.max(12, r.top - estimatedHeight - 8)
                : Math.min(
                    window.innerHeight - estimatedHeight - 12,
                    r.bottom + 8,
                );

            const left = Math.max(
                12,
                Math.min(window.innerWidth - width - 12, r.right - width),
            );

            setPos({ top, left, width });
        };

        update();

        const onPointerDown = (e: PointerEvent) => {
            const t = e.target as Node | null;
            if (!t) return;

            if (btnRef.current?.contains(t)) return;
            if (panelRef.current?.contains(t)) return;

            setOpen(false);
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                btnRef.current?.focus();
                return;
            }

            if (!enabledIndexes.length) return;

            const currentIndex = itemRefs.current.findIndex(
                (el) => el === document.activeElement,
            );
            const firstEnabled = enabledIndexes[0];
            const lastEnabled = enabledIndexes[enabledIndexes.length - 1];

            if (e.key === "ArrowDown") {
                e.preventDefault();

                if (currentIndex === -1) {
                    itemRefs.current[firstEnabled]?.focus();
                    return;
                }

                const pos = enabledIndexes.indexOf(currentIndex);
                const next = enabledIndexes[(pos + 1) % enabledIndexes.length];
                itemRefs.current[next]?.focus();
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();

                if (currentIndex === -1) {
                    itemRefs.current[lastEnabled]?.focus();
                    return;
                }

                const pos = enabledIndexes.indexOf(currentIndex);
                const next =
                    enabledIndexes[
                    (pos - 1 + enabledIndexes.length) % enabledIndexes.length
                        ];
                itemRefs.current[next]?.focus();
                return;
            }

            if (e.key === "Home") {
                e.preventDefault();
                itemRefs.current[firstEnabled]?.focus();
                return;
            }

            if (e.key === "End") {
                e.preventDefault();
                itemRefs.current[lastEnabled]?.focus();
            }
        };

        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        document.addEventListener("pointerdown", onPointerDown, true);
        window.addEventListener("keydown", onKey);

        const focusId = window.setTimeout(() => {
            if (enabledIndexes.length) {
                itemRefs.current[enabledIndexes[0]]?.focus();
            }
        }, 0);

        return () => {
            window.clearTimeout(focusId);
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
            document.removeEventListener("pointerdown", onPointerDown, true);
            window.removeEventListener("keydown", onKey);
        };
    }, [open, mounted, enabledIndexes, actions.length, anchorPoint]);

    const panel =
        mounted && open && pos
            ? createPortal(
                <div
                    className="fixed z-[9999]"
                    style={{ top: pos.top, left: pos.left, width: pos.width }}
                >
                    <div
                        id={menuId}
                        ref={panelRef}
                        role="menu"
                        aria-orientation="vertical"
                        className="ui-ide-menupanel"
                    >
                        {actions.map((a, i) => (
                            <button
                                key={`${a.label}-${i}`}
                                ref={(el) => {
                                    itemRefs.current[i] = el;
                                }}
                                role="menuitem"
                                type="button"
                                disabled={a.disabled}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (a.disabled) return;

                                    setOpen(false);
                                    a.onClick();

                                    requestAnimationFrame(() => {
                                        btnRef.current?.focus();
                                    });
                                }}
                                className={cn(
                                    "ui-ide-menuitem",
                                    a.danger && "ui-ide-menuitem--danger",
                                    a.disabled && "cursor-not-allowed opacity-45",
                                )}
                            >
                                  <span className="grid h-5 w-5 place-items-center">
                                      {a.icon}
                                  </span>
                                <span className="flex-1 text-left">{a.label}</span>
                            </button>
                        ))}
                    </div>
                </div>,
                document.body,
            )
            : null;

    return (
        <>
            {trigger === "button" ? (
                <button
                    ref={btnRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls={open ? menuId : undefined}
                    aria-label="Open node actions"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpen((v) => !v);
                    }}
                    className="ui-ide-menubtn"
                    title="Actions"
                >
                    <IconDots className="h-4 w-4" />
                </button>
            ) : null}

            {panel}
        </>
    );
}

export function defaultExt(lang: WorkspaceLanguage) {
    switch (lang) {
        case "python":
            return ".py";
        case "java":
            return ".java";
        case "javascript":
            return ".js";
        case "c":
            return ".c";
        case "cpp":
            return ".cpp";
        case "sql":
            return ".sql";
    }
}