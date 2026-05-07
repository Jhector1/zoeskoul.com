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
import type { editor } from "monaco-editor";

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
    exerciseStateKey?: string;
    instanceKey: string;
    lang: string;
}) {
    /**
     * Never use a random instance key for review/practice editors if a modelKey exists.
     * Random paths caused remounts to reload starter code like print("Hello Python!").
     */
    const modelPart = sanitizePathPart(args.modelKey || args.instanceKey);
    const scopePart = sanitizePathPart(args.exerciseStateKey || args.modelKey || modelPart);

    const base = scopePart ? `${scopePart}/${modelPart}` : modelPart;
    return `inmemory://zoeskoul-runner/${base}.${extForLang(args.lang)}`;
}

function isDisposedModel(model: any) {
    try {
        return !model || model.isDisposed?.() === true;
    } catch {
        return true;
    }
}

function getLiveEditorModel(ed: any) {
    try {
        if (!ed || ed.isDisposed?.() === true) return null;
        const model = ed.getModel?.();
        if (isDisposedModel(model)) return null;
        return model;
    } catch {
        return null;
    }
}

function safeEditorValue(ed: any, fallback = "") {
    try {
        const model = getLiveEditorModel(ed);
        if (!model) return fallback;
        return String(model.getValue?.() ?? fallback);
    } catch {
        return fallback;
    }
}

function editorCacheKey(scope: string, path: string) {
    return `zoe:editor-cache:${scope}:${path}`;
}

function readCachedEditorValue(scope: string, path: string): string | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(editorCacheKey(scope, path));
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        return typeof parsed?.value === "string" ? parsed.value : null;
    } catch {
        return null;
    }
}

function writeCachedEditorValue(scope: string, path: string, value: string) {
    if (typeof window === "undefined") return;

    try {
        window.sessionStorage.setItem(
            editorCacheKey(scope, path),
            JSON.stringify({
                value,
                updatedAt: Date.now(),
            }),
        );
    } catch {
        // Ignore storage quota/private-mode failures.
    }
}

function looksLikePythonHelloStarter(value: string) {
    return /^\s*print\((["'])Hello Python!\1\)\s*;?\s*$/.test(value);
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
    exerciseStateKey?: string;
    workspace?: any;
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
        exerciseStateKey,
        workspace,
        frame = "card",
        mobileEditMode = "auto",
    } = props;

    const reactId = useId();
    const instanceKeyRef = useRef(`editor-${reactId.replace(/[:]/g, "")}`);
    const editorRef = useRef<any>(null);
    const editorDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
    const mountedRef = useRef(false);

    const disposeEditorListeners = useCallback(() => {
        const disposables = editorDisposablesRef.current;
        editorDisposablesRef.current = [];

        for (const disposable of disposables) {
            try {
                disposable.dispose?.();
            } catch {
                // Ignore Monaco disposal races during card navigation.
            }
        }
    }, []);

    const applyingExternalRef = useRef(false);
    const isEditorFocusedRef = useRef(false);
    const pendingExternalValueRef = useRef<string | null>(null);
    const lastLocalValueRef = useRef<string>(String(code ?? ""));
    const prevPathRef = useRef<string>("");

    const [isNarrowScreen, setIsNarrowScreen] = useState(false);
    const [mobileEditing, setMobileEditing] = useState(false);
    const [needsMobileEditToggle, setNeedsMobileEditToggle] = useState(false);

    const normalizedLang = useMemo(() => normalizeEditorLanguage(lang), [lang]);

    const effectiveModelKey = useMemo(
        () => modelKey || exerciseStateKey || instanceKeyRef.current,
        [modelKey, exerciseStateKey],
    );

    const effectiveExerciseStateKey = useMemo(
        () => exerciseStateKey || modelKey || effectiveModelKey,
        [exerciseStateKey, modelKey, effectiveModelKey],
    );

    const hasRealExerciseScope =
        typeof exerciseStateKey === "string" &&
        exerciseStateKey.trim() !== "" &&
        !exerciseStateKey.startsWith("code-runner:");

    const cacheScope = useMemo(
        () =>
            hasRealExerciseScope
                ? `${exerciseStateKey}`
                : "",
        [hasRealExerciseScope, exerciseStateKey],
    );

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            disposeEditorListeners();
            editorRef.current = null;
            pendingExternalValueRef.current = null;
            isEditorFocusedRef.current = false;
            applyingExternalRef.current = false;
        };
    }, [disposeEditorListeners]);

    const path = useMemo(() => {
        const p = buildModelPath({
            modelKey: effectiveModelKey,
            exerciseStateKey: effectiveExerciseStateKey,
            instanceKey: instanceKeyRef.current,
            lang: normalizedLang,
        });

        const debugReview =
            process.env.NODE_ENV === "development" &&
            typeof window !== "undefined" &&
            window.localStorage?.getItem("zoe:debugReview") === "1";

        if (debugReview) {
            console.log("[EditorMount] editor input", {
                exerciseStateKey: effectiveExerciseStateKey,
                rawExerciseStateKey: exerciseStateKey,
                modelKey: effectiveModelKey,
                rawModelKey: modelKey,
                lang,
                code: code?.slice(0, 50),
                path: p,
            });
        }

        return p;
    }, [effectiveModelKey, effectiveExerciseStateKey, exerciseStateKey, modelKey, normalizedLang]);

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
        if (!mountedRef.current || !ed || ed.isDisposed?.() === true) {
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
            if (!mountedRef.current) return;

            const ed = editorRef.current;
            const model = getLiveEditorModel(ed);
            if (!ed || !model) return;

            const current = safeEditorValue(ed, "");
            if (current === next) {
                lastLocalValueRef.current = next;
                pendingExternalValueRef.current = null;
                return;
            }

            applyingExternalRef.current = true;

            const viewState = ed.saveViewState?.();
            const selection = ed.getSelection?.();

            try {
                if (isDisposedModel(model)) return;

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
                try {
                    if (!isDisposedModel(model)) {
                        model.setValue?.(next);
                    }
                } catch {
                    // Monaco can dispose models during sketch/card navigation.
                }
            }

            try {
                if (viewState && ed.isDisposed?.() !== true) ed.restoreViewState?.(viewState);
                if (selection && ed.isDisposed?.() !== true) ed.setSelection?.(selection);
            } catch {
                // Ignore view-state restore races after navigation.
            }

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
        if (!mountedRef.current || !ed || ed.isDisposed?.() === true) return;

        try {
            ed.updateOptions?.({
                readOnly: effectiveReadOnly,
                readOnlyMessage: { value: "" },
                domReadOnly: true,
            });
        } catch {
            // Ignore Monaco disposal races during card navigation.
        }
    }, [effectiveReadOnly]);

    useEffect(() => {
        let next = String(code ?? "");
        const cached = cacheScope ? readCachedEditorValue(cacheScope, path) : null;

        /**
         * Safety net:
         * If parent state remounts with the starter while this editor path has
         * a newer local edit, keep the local edit and push it back upstream.
         */
        if (
            cached != null &&
            cached !== next &&
            (looksLikePythonHelloStarter(next) || next === "") &&
            !looksLikePythonHelloStarter(cached) &&
            cached !== ""
        ) {
            next = cached;
            queueMicrotask(() => onChange(cached));
        }

        const ed = editorRef.current;
        const model = getLiveEditorModel(ed);
        if (!mountedRef.current || !ed || !model) {
            lastLocalValueRef.current = next;
            return;
        }

        const pathChanged = prevPathRef.current !== path;
        prevPathRef.current = path;

        const current = safeEditorValue(ed, "");
        if (current === next) {
            lastLocalValueRef.current = next;
            pendingExternalValueRef.current = null;
            return;
        }

        if (isEditorFocusedRef.current && !pathChanged) {
            pendingExternalValueRef.current = next;
            return;
        }

        applyExternalValue(next);
    }, [code, path, cacheScope, applyExternalValue, onChange]);

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
                    key={path}
                    height={height}
                    path={path}
                    language={normalizedLang}
                    defaultValue={(() => {
                        if (!cacheScope) return String(code ?? "");
                        const cached = readCachedEditorValue(cacheScope, path);
                        if (cached === null) return String(code ?? "");
                        // Don't restore an empty cache over non-empty incoming code
                        if (cached === "" && code) return String(code);
                        return cached;
                    })()}
                    theme={theme}
                    saveViewState
                    onMount={(ed: any) => {
                        disposeEditorListeners();

                        if (!mountedRef.current || !ed || ed.isDisposed?.() === true) {
                            return;
                        }

                        editorRef.current = ed;
                        lastLocalValueRef.current = safeEditorValue(ed, String(code ?? ""));
                        onMount?.(ed);

                        refreshMobileEditNeed();

                        const disposables: Array<{ dispose: () => void }> = [];

                        const track = (disposable: any) => {
                            if (disposable && typeof disposable.dispose === "function") {
                                disposables.push(disposable);
                            }
                        };

                        track(
                            ed.onDidFocusEditorText?.(() => {
                                if (!mountedRef.current || ed.isDisposed?.() === true) return;
                                isEditorFocusedRef.current = true;
                            }),
                        );

                        track(
                            ed.onDidBlurEditorText?.(() => {
                                if (!mountedRef.current || ed.isDisposed?.() === true) return;
                                isEditorFocusedRef.current = false;

                                if (isNarrowScreen) setMobileEditing(false);
                                flushPendingExternal();
                            }),
                        );

                        track(
                            ed.onDidBlurEditorWidget?.(() => {
                                if (!mountedRef.current || ed.isDisposed?.() === true) return;
                                isEditorFocusedRef.current = false;

                                if (isNarrowScreen) setMobileEditing(false);
                                flushPendingExternal();
                            }),
                        );

                        track(
                            ed.onDidContentSizeChange?.(() => {
                                if (!mountedRef.current || ed.isDisposed?.() === true) return;
                                refreshMobileEditNeed();
                            }),
                        );

                        track(
                            ed.onDidLayoutChange?.(() => {
                                if (!mountedRef.current || ed.isDisposed?.() === true) return;
                                refreshMobileEditNeed();
                            }),
                        );

                        editorDisposablesRef.current = disposables;
                    }}
                    onChange={(v) => {
                        if (!mountedRef.current || applyingExternalRef.current) return;

                        const ed = editorRef.current;
                        if (ed?.isDisposed?.() === true) return;

                        const next = v ?? "";
                        lastLocalValueRef.current = next;
                        if (cacheScope) {
                            writeCachedEditorValue(cacheScope, path, next);
                        }
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