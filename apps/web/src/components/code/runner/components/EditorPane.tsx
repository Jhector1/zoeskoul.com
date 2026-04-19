"use client";

import React, {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react";
import dynamic from "next/dynamic";
import { cn } from "@/components/ide/utils";
import { editor } from "monaco-editor";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type RunnerFrame = "plain" | "card";
type MobileEditMode = "auto" | "always" | "never";

function normalizeEditorLanguage(lang: string) {
    const value = String(lang ?? "").toLowerCase();

    switch (value) {
        case "python":
            return "python";
        case "java":
            return "java";
        case "javascript":
        case "js":
            return "javascript";
        case "typescript":
        case "ts":
            return "typescript";
        case "html":
        case "htm":
        case "web":
            return "html";
        case "css":
            return "css";
        case "json":
            return "json";
        case "sql":
            return "sql";
        case "c":
            return "c";
        case "cpp":
        case "c++":
            return "cpp";
        case "bash":
        case "shell":
        case "sh":
            return "shell";
        default:
            return "plaintext";
    }
}

function extForLang(lang: string) {
    const value = String(lang ?? "").toLowerCase();

    switch (value) {
        case "python":
            return "py";
        case "java":
            return "java";
        case "javascript":
        case "js":
            return "js";
        case "typescript":
        case "ts":
            return "ts";
        case "html":
        case "htm":
        case "web":
            return "html";
        case "css":
            return "css";
        case "json":
            return "json";
        case "c":
            return "c";
        case "cpp":
        case "c++":
            return "cpp";
        case "bash":
        case "shell":
        case "sh":
            return "sh";
        case "sql":
            return "sql";
        default:
            return "txt";
    }
}

function sanitizePathPart(x: string) {
    return String(x ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\//, "")
        .replace(/\.\./g, "")
        .replace(/[^a-zA-Z0-9._/-]/g, "-")
        .replace(/\/+/g, "/") || "scratch";
}

function buildModelPath(args: {
    modelKey?: string;
    instanceKey: string;
    lang: string;
}) {
    const base = sanitizePathPart(args.modelKey || args.instanceKey);
    return `inmemory://zoeskoul-runner/${base}.${extForLang(args.lang)}`;
}

export default function EditorPane(props: {
    lang: string;
    code: string;
    onChange: (v: string) => void;
    theme: "vs" | "vs-dark";
    height: number;
    disabled?: boolean;
    onMount?: (ed: any) => void;
    modelKey?: string;
    frame?: RunnerFrame;
    mobileEditMode?: MobileEditMode;
}) {
    const {
        lang,
        code,
        onChange,
        theme,
        height,
        disabled = false,
        onMount,
        modelKey,
        frame = "card",
        mobileEditMode = "auto",
    } = props;

    const reactId = useId();
    const instanceKeyRef = useRef(`editor-${reactId.replace(/[:]/g, "")}`);
    const editorRef = useRef<any>(null);

    const applyingExternalRef = useRef(false);
    const isEditorFocusedRef = useRef(false);
    const pendingExternalValueRef = useRef<string | null>(null);
    const lastLocalValueRef = useRef<string>(String(code ?? ""));

    const [isNarrowScreen, setIsNarrowScreen] = useState(false);
    const [mobileEditing, setMobileEditing] = useState(false);
    const [needsMobileEditToggle, setNeedsMobileEditToggle] = useState(false);

    const normalizedLang = useMemo(() => normalizeEditorLanguage(lang), [lang]);

    const path = useMemo(() => {
        return buildModelPath({
            modelKey,
            instanceKey: instanceKeyRef.current,
            lang: normalizedLang,
        });
    }, [modelKey, normalizedLang]);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const mq = window.matchMedia("(max-width: 767px)");
        const update = () => setIsNarrowScreen(mq.matches);

        update();

        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", update);
            return () => mq.removeEventListener("change", update);
        }

        mq.addListener(update);
        return () => mq.removeListener(update);
    }, []);

    const refreshMobileEditNeed = useCallback(() => {
        const ed = editorRef.current;
        if (!ed) {
            setNeedsMobileEditToggle(false);
            return;
        }

        if (!isNarrowScreen || frame !== "card" || mobileEditMode !== "auto") {
            setNeedsMobileEditToggle(false);
            return;
        }

        try {
            const scrollHeight = ed.getScrollHeight?.() ?? 0;
            const layoutInfo = ed.getLayoutInfo?.();
            const viewportHeight = layoutInfo?.height ?? height ?? 0;

            setNeedsMobileEditToggle(scrollHeight > viewportHeight + 12);
        } catch {
            setNeedsMobileEditToggle(false);
        }
    }, [frame, height, isNarrowScreen, mobileEditMode]);

    const applyExternalValue = useCallback(
        (next: string) => {
            const ed = editorRef.current;
            if (!ed) return;

            const model = ed.getModel?.();
            if (!model) return;

            const current = model.getValue?.() ?? "";
            if (current === next) {
                lastLocalValueRef.current = next;
                pendingExternalValueRef.current = null;
                return;
            }

            applyingExternalRef.current = true;

            const viewState = ed.saveViewState?.();
            const selection = ed.getSelection?.();

            try {
                ed.pushUndoStop?.();
                ed.executeEdits?.("external-sync", [
                    {
                        range: model.getFullModelRange(),
                        text: next,
                        forceMoveMarkers: true,
                    },
                ]);
                ed.pushUndoStop?.();
            } catch {
                model.setValue?.(next);
            }

            if (viewState) ed.restoreViewState?.(viewState);
            if (selection) ed.setSelection?.(selection);

            applyingExternalRef.current = false;
            lastLocalValueRef.current = next;
            pendingExternalValueRef.current = null;
            refreshMobileEditNeed();
        },
        [refreshMobileEditNeed],
    );

    const flushPendingExternal = useCallback(() => {
        const pending = pendingExternalValueRef.current;
        if (pending == null) return;
        applyExternalValue(pending);
    }, [applyExternalValue]);

    useEffect(() => {
        if (disabled) {
            setMobileEditing(false);
        }
    }, [disabled]);

    useEffect(() => {
        refreshMobileEditNeed();
    }, [refreshMobileEditNeed, code, height, path]);

    const canUseMobileEditGuard =
        frame === "card" &&
        isNarrowScreen &&
        mobileEditMode !== "never";

    const useMobileScrollGuard =
        canUseMobileEditGuard &&
        (mobileEditMode === "always" || needsMobileEditToggle);

    const showMobileEditButton = !disabled && useMobileScrollGuard;

    const effectiveReadOnly =
        disabled || (useMobileScrollGuard && !mobileEditing);

    const passThroughOnMobile =
        frame === "card" &&
        isNarrowScreen &&
        effectiveReadOnly;

    useEffect(() => {
        if (!showMobileEditButton) {
            setMobileEditing(false);
        }
    }, [showMobileEditButton]);

    useEffect(() => {
        const ed = editorRef.current;
        if (!ed) return;

        ed.updateOptions?.({
            readOnly: effectiveReadOnly,
            readOnlyMessage: { value: "" },
            domReadOnly: true,
        });
    }, [effectiveReadOnly]);

    useEffect(() => {
        const next = String(code ?? "");
        const ed = editorRef.current;
        if (!ed) {
            lastLocalValueRef.current = next;
            return;
        }

        const model = ed.getModel?.();
        if (!model) {
            lastLocalValueRef.current = next;
            return;
        }

        const current = model.getValue?.() ?? "";
        if (current === next) {
            lastLocalValueRef.current = next;
            pendingExternalValueRef.current = null;
            return;
        }

        if (isEditorFocusedRef.current) {
            pendingExternalValueRef.current = next;
            return;
        }

        applyExternalValue(next);
    }, [code, path, applyExternalValue]);

    const options = useMemo<editor.IStandaloneEditorConstructionOptions>(() => {
        return {
            minimap: { enabled: false },
            fontSize: isNarrowScreen ? 14 : 13,
            scrollBeyondLastLine: false,
            wordWrap: "on" as const,
            automaticLayout: true,
            readOnly: effectiveReadOnly,
            readOnlyMessage: { value: "" },
            domReadOnly: true,
            formatOnPaste: false,
            formatOnType: false,
            glyphMargin: false,
            folding: !isNarrowScreen,
            stickyScroll: { enabled: false },
            renderLineHighlight: isNarrowScreen ? "none" : "line",
            lineNumbers: isNarrowScreen ? "off" : "on",
            lineNumbersMinChars: isNarrowScreen ? 2 : 3,
            lineDecorationsWidth: isNarrowScreen ? 8 : 10,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: {
                alwaysConsumeMouseWheel: false,
                verticalScrollbarSize: isNarrowScreen ? 10 : 12,
                horizontalScrollbarSize: isNarrowScreen ? 10 : 12,
            },
            padding: {
                top: 12,
                bottom: 16,
            },
        };
    }, [effectiveReadOnly, isNarrowScreen]);

    return (
        <div className="relative h-full w-full min-w-0">
            <div
                className={cn(
                    "h-full w-full min-w-0",
                    passThroughOnMobile && "pointer-events-none",
                )}
                style={{ touchAction: isNarrowScreen ? "pan-y" : "auto" }}
            >
                <Monaco
                    height={height}
                    path={path}
                    language={normalizedLang}
                    defaultValue={String(code ?? "")}
                    theme={theme}
                    saveViewState
                    onMount={(ed: any) => {
                        editorRef.current = ed;
                        lastLocalValueRef.current = ed.getValue?.() ?? String(code ?? "");
                        onMount?.(ed);

                        refreshMobileEditNeed();

                        ed.onDidFocusEditorText?.(() => {
                            isEditorFocusedRef.current = true;
                        });

                        ed.onDidBlurEditorText?.(() => {
                            isEditorFocusedRef.current = false;

                            if (isNarrowScreen) setMobileEditing(false);
                            flushPendingExternal();
                        });

                        ed.onDidBlurEditorWidget?.(() => {
                            isEditorFocusedRef.current = false;

                            if (isNarrowScreen) setMobileEditing(false);
                            flushPendingExternal();
                        });

                        ed.onDidContentSizeChange?.(() => {
                            refreshMobileEditNeed();
                        });

                        ed.onDidLayoutChange?.(() => {
                            refreshMobileEditNeed();
                        });
                    }}
                    onChange={(v) => {
                        if (applyingExternalRef.current) return;
                        const next = v ?? "";
                        lastLocalValueRef.current = next;
                        onChange(next);
                    }}
                    options={options}
                />
            </div>

            {showMobileEditButton ? (
                <button
                    type="button"
                    onClick={() => {
                        setMobileEditing((prev) => {
                            const next = !prev;

                            if (next) {
                                requestAnimationFrame(() => {
                                    editorRef.current?.focus?.();
                                });
                            }

                            return next;
                        });
                    }}
                    className="absolute bottom-3 right-3 z-20 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-extrabold text-neutral-800 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/70 dark:text-white/85"
                >
                    {mobileEditing ? "Done" : "Edit"}
                </button>
            ) : null}
        </div>
    );
}