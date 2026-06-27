"use client";

import React from "react";
import { createPortal } from "react-dom";
import HeaderSlick from "@/components/HeaderSlick";
import type { HeaderGamificationVm } from "../../types";
import NavButton from "@/components/ui/NavButton";
import { learnerUiFlags } from "@/lib/config/learnerUiFlags";

type Props = {
    locale: string;
    toolsUiEnabled: boolean;
    toolsToggleAllowed?: boolean;
    showDesktopLeft: boolean;
    showDesktopRight: boolean;
    leftCollapsed: boolean;
    rightCollapsed: boolean;
    modulesHref: string;
    onToggleLeftPanel: () => void;
    onToggleRightPanel: () => void;
    resetOptions: Array<{
        id: string;
        label: string;
        description: string;
        onSelect: () => void;
    }>;
    onPrevTopic?: () => void;
    onNextTopic?: () => void;
    prevTopic: { id?: string } | null;
    nextTopic: { id?: string } | null;
    unlockAll: boolean;
    viewIsComplete: boolean;
    headerGamification: HeaderGamificationVm | null;
    saveStatus?: "idle" | "saving" | "saved" | "error" | "conflict";
    lastSaveError?: string | null;
};

type ResetMenuPlacement = {
    style: React.CSSProperties;
    arrowLeft: number;
};

const RESET_MENU_MARGIN = 12;
const RESET_MENU_GAP = 10;
const RESET_MENU_MAX_WIDTH = 336;

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

export default function ReviewModuleHeader({
                                               toolsUiEnabled,
                                               toolsToggleAllowed = true,
                                               showDesktopLeft,
                                               showDesktopRight,
                                               leftCollapsed,
                                               rightCollapsed,
                                               modulesHref,
                                               onToggleLeftPanel,
                                               onToggleRightPanel,
                                               resetOptions,
                                               onPrevTopic,
                                               onNextTopic,
                                               prevTopic,
                                               nextTopic,
                                               unlockAll,
                                               viewIsComplete,
                                               headerGamification,
                                               saveStatus = "idle",
                                               lastSaveError,
                                           }: Props) {
    const resetMenuId = React.useId();
    const [resetMenuOpen, setResetMenuOpen] = React.useState(false);
    const [resetMenuPlacement, setResetMenuPlacement] = React.useState<ResetMenuPlacement | null>(null);
    const resetMenuRef = React.useRef<HTMLDivElement | null>(null);
    // HeaderSlick renders this slot in both desktop and mobile header rows.
    // A normal React ref can end up pointing at the hidden clone, so always anchor
    // the menu to the button that was actually clicked.
    const resetButtonAnchorRef = React.useRef<HTMLButtonElement | null>(null);

    const getResetMenuPlacement = React.useCallback((buttonOverride?: HTMLButtonElement | null): ResetMenuPlacement | null => {
        if (typeof window === "undefined") return null;

        const button = buttonOverride ?? resetButtonAnchorRef.current;
        if (!button) return null;

        const rect = button.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || RESET_MENU_MAX_WIDTH;
        const availableWidth = Math.max(180, viewportWidth - RESET_MENU_MARGIN * 2);
        const menuWidth = Math.min(RESET_MENU_MAX_WIDTH, availableWidth);
        const buttonCenterX = rect.left + rect.width / 2;
        const maxLeft = Math.max(RESET_MENU_MARGIN, viewportWidth - menuWidth - RESET_MENU_MARGIN);
        const left = clamp(buttonCenterX - menuWidth / 2, RESET_MENU_MARGIN, maxLeft);

        return {
            style: {
                position: "fixed",
                top: Math.round(rect.bottom + RESET_MENU_GAP),
                left: Math.round(left),
                width: Math.round(menuWidth),
                zIndex: 1000,
            },
            arrowLeft: Math.round(clamp(buttonCenterX - left, 24, menuWidth - 24)),
        };
    }, []);

    const updateResetMenuPosition = React.useCallback(() => {
        const placement = getResetMenuPlacement();
        if (placement) {
            setResetMenuPlacement(placement);
        }
    }, [getResetMenuPlacement]);

    const closeResetMenu = React.useCallback(() => {
        setResetMenuOpen(false);
    }, []);

    const toggleResetMenu = React.useCallback((button: HTMLButtonElement) => {
        resetButtonAnchorRef.current = button;

        setResetMenuOpen((open) => {
            if (open) return false;

            const placement = getResetMenuPlacement(button);
            if (placement) {
                setResetMenuPlacement(placement);
            }
            return true;
        });
    }, [getResetMenuPlacement]);

    React.useEffect(() => {
        if (!resetMenuOpen) return;

        updateResetMenuPosition();

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (resetButtonAnchorRef.current?.contains(target)) return;
            if (resetMenuRef.current?.contains(target)) return;
            closeResetMenu();
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeResetMenu();
                resetButtonAnchorRef.current?.focus();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown, true);
        document.addEventListener("keydown", handleEscape);
        window.addEventListener("resize", updateResetMenuPosition);
        window.addEventListener("scroll", updateResetMenuPosition, true);
        window.visualViewport?.addEventListener("resize", updateResetMenuPosition);
        window.visualViewport?.addEventListener("scroll", updateResetMenuPosition);

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown, true);
            document.removeEventListener("keydown", handleEscape);
            window.removeEventListener("resize", updateResetMenuPosition);
            window.removeEventListener("scroll", updateResetMenuPosition, true);
            window.visualViewport?.removeEventListener("resize", updateResetMenuPosition);
            window.visualViewport?.removeEventListener("scroll", updateResetMenuPosition);
        };
    }, [closeResetMenu, resetMenuOpen, updateResetMenuPosition]);

    const compactModeActive =
        learnerUiFlags.compactLearnerUi && !learnerUiFlags.showDebugLearningUi;
    const showTopicsButton =
        !compactModeActive || !showDesktopLeft || leftCollapsed;
    const showToolsButton =
        toolsUiEnabled &&
        toolsToggleAllowed &&
        (!compactModeActive || !showDesktopRight || rightCollapsed);

    const resetMenuPortal =
        resetMenuOpen && resetMenuPlacement && typeof document !== "undefined"
            ? createPortal(
                <div
                    ref={resetMenuRef}
                    id={resetMenuId}
                    role="menu"
                    aria-label="Reset progress options"
                    style={resetMenuPlacement.style}
                    className="overflow-visible rounded-2xl border border-[rgb(var(--ui-border)/0.95)] bg-[rgb(var(--ui-surface)/0.98)] p-2 shadow-[0_24px_70px_rgba(2,6,23,0.36)] ring-1 ring-white/5 backdrop-blur-xl"
                >
                    <div
                        aria-hidden="true"
                        style={{ left: resetMenuPlacement.arrowLeft }}
                        className="absolute -top-1 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-[rgb(var(--ui-border)/0.95)] bg-[rgb(var(--ui-surface)/0.98)]"
                    />
                    <div className="relative">
                        <div className="px-3 pb-2 pt-2">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[rgb(var(--ui-text-muted)/0.78)]">
                                Reset progress
                            </div>
                            <div className="mt-1 text-xs font-semibold leading-snug text-[rgb(var(--ui-text-muted)/0.96)]">
                                Choose how much work to clear. You will confirm before anything is deleted.
                            </div>
                        </div>

                        <div className="my-1 h-px bg-[rgb(var(--ui-border)/0.8)]" />

                        <div className="grid gap-1">
                            {resetOptions.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        closeResetMenu();
                                        option.onSelect();
                                    }}
                                    className="group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[rgb(var(--ui-muted)/0.76)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ui-primary)/0.5)]"
                                >
                                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-muted)/0.48)] text-sm font-black text-[rgb(var(--ui-text)/0.88)] transition group-hover:bg-[rgb(var(--ui-primary)/0.12)]">
                                        ↺
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-extrabold text-[rgb(var(--ui-text)/0.98)]">
                                            {option.label}
                                        </span>
                                        <span className="mt-0.5 block text-xs font-medium leading-snug text-[rgb(var(--ui-text-muted)/0.96)]">
                                            {option.description}
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body,
            )
            : null;

    return (
        <>
        <HeaderSlick
            slot={
                <div className="flex w-full items-center justify-between gap-3">
                    <div className="inline-flex min-w-0 flex-wrap items-center gap-2 [&>button]:shrink-0">
                        <NavButton
                            href={modulesHref}
                            className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                            title="Go to modules"
                            loadingText="Opening modules..."
                        >
                            ← Modules
                        </NavButton>

                        {showTopicsButton ? (
                            <button
                                type="button"
                                onClick={onToggleLeftPanel}
                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                title="Topics"
                            >
                                {showDesktopLeft
                                    ? leftCollapsed
                                        ? "Topics ▶"
                                        : "Topics"
                                    : "Topics"}
                            </button>
                        ) : null}

                        {showToolsButton ? (
                            <button
                                type="button"
                                onClick={onToggleRightPanel}
                                className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                                title="Tools"
                            >
                                {rightCollapsed ? "Tools ▶" : "Tools ◀"}
                            </button>
                        ) : null}

                        <div className="relative">
                            <button
                                type="button"
                                data-testid="review-reset-menu-button"
                                onClick={(event) => toggleResetMenu(event.currentTarget)}
                                aria-expanded={resetMenuOpen}
                                aria-haspopup="menu"
                                aria-controls={resetMenuOpen ? resetMenuId : undefined}
                                className="ui-btn ui-btn-secondary gap-1.5 text-xs font-extrabold whitespace-nowrap"
                            >
                                <span>Reset</span>
                                <span
                                    aria-hidden="true"
                                    className={`text-[10px] leading-none opacity-75 transition-transform ${resetMenuOpen ? "rotate-180" : ""}`}
                                >
                                    ▾
                                </span>
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={onPrevTopic}
                            className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                            disabled={!prevTopic?.id}
                            title={!prevTopic?.id ? "No previous topic" : "Previous topic"}
                        >
                            ←
                        </button>

                        <button
                            type="button"
                            onClick={onNextTopic}
                            className="ui-btn ui-btn-secondary text-xs font-extrabold whitespace-nowrap"
                            disabled={!nextTopic?.id || (!unlockAll && !viewIsComplete)}
                            title={
                                !nextTopic?.id
                                    ? "No next topic"
                                    : !unlockAll && !viewIsComplete
                                        ? "Complete the topic to continue"
                                        : "Next topic"
                            }
                        >
                            →
                        </button>
                    </div>

                    <div className="hidden sm:flex shrink-0 items-center gap-2">
                        {saveStatus && saveStatus !== "idle" ? (
                            <div
                                className="rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.88)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--ui-text)/0.96)]"
                                title={lastSaveError ?? undefined}
                            >
                                {saveStatus === "saving"
                                    ? "Saving..."
                                    : saveStatus === "error"
                                        ? "Save failed"
                                        : saveStatus === "conflict"
                                            ? "Sync conflict"
                                            : "Saved"}
                            </div>
                        ) : null}

                    {headerGamification ? (
                        <>
                            <div className="rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.88)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--ui-text)/0.96)]">
                                🔥 {headerGamification.currentStreak}
                            </div>

                            <div className="rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.88)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--ui-text)/0.96)]">
                                Lv {headerGamification.level}
                            </div>

                            <div className="rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.88)] px-2.5 py-1 text-xs font-semibold text-[rgb(var(--ui-text)/0.96)]">
                                {headerGamification.totalXp.toLocaleString()} XP
                            </div>
                        </>
                    ) : null}
                    </div>
                </div>
            }
            isBillingStatus={false}
            brand={process.env.NEXT_PUBLIC_APP_NAME}
            badge=""
            isUser={false}
            isNav={false}
        />
        {resetMenuPortal}
        </>
    );
}
