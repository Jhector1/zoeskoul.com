"use client";

import Editor from "@monaco-editor/react";
import type {
  editor,
} from "monaco-editor";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  buildControlledEditorModelPath,
  normalizeControlledEditorLanguage,
} from "./model";

export type ControlledCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language: string;
  modelKey: string;
  fileName?: string;
  height?: number | string;
  theme?: "vs" | "vs-dark";
  disabled?: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  className?: string;
};

function editorValue(
  instance: editor.IStandaloneCodeEditor | null,
): string | null {
  try {
    const model =
      instance?.getModel();
    return model
      ? model.getValue()
      : null;
  } catch {
    return null;
  }
}

/**
 * Framework-neutral controlled Monaco surface.
 *
 * Application adapters own persistence, validation, toolbars, output panes,
 * localization, and runtime policy. This component owns only deterministic
 * model identity and safe controlled text editing.
 */
export function ControlledCodeEditor(
  props: ControlledCodeEditorProps,
) {
  const editorRef =
    useRef<editor.IStandaloneCodeEditor | null>(
      null,
    );
  const applyingExternalRef =
    useRef(false);
  const [compact, setCompact] =
    useState(false);

  const language =
    normalizeControlledEditorLanguage(
      props.language,
    );
  const path = useMemo(
    () =>
      buildControlledEditorModelPath({
        modelKey: props.modelKey,
        language,
        fileName: props.fileName,
      }),
    [
      language,
      props.fileName,
      props.modelKey,
    ],
  );
  const readOnly =
    props.readOnly === true ||
    props.disabled === true;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.matchMedia
    ) {
      return;
    }

    const query =
      window.matchMedia(
        "(max-width: 767px)",
      );
    const update = () =>
      setCompact(query.matches);

    update();
    query.addEventListener?.(
      "change",
      update,
    );

    return () => {
      query.removeEventListener?.(
        "change",
        update,
      );
    };
  }, []);

  useEffect(() => {
    const instance =
      editorRef.current;
    const current =
      editorValue(instance);
    const next =
      String(props.value ?? "");

    if (
      current === null ||
      current === next
    ) {
      return;
    }

    if (!instance) return;

    const model =
      instance.getModel();
    if (!model) return;

    applyingExternalRef.current = true;

    try {
      const viewState =
        instance.saveViewState();
      const selection =
        instance.getSelection();

      instance.pushUndoStop();
      instance.executeEdits(
        "controlled-external-sync",
        [
          {
            range:
              model.getFullModelRange(),
            text: next,
            forceMoveMarkers: true,
          },
        ],
      );
      instance.pushUndoStop();

      if (viewState) {
        instance.restoreViewState(
          viewState,
        );
      }
      if (selection) {
        instance.setSelection(
          selection,
        );
      }
    } catch {
      try {
        model.setValue(next);
      } catch {
        // Monaco may dispose a model while the learner changes cards.
      }
    } finally {
      window.setTimeout(() => {
        applyingExternalRef.current =
          false;
      }, 0);
    }
  }, [
    path,
    props.value,
  ]);

  const options =
    useMemo<
      editor.IStandaloneEditorConstructionOptions
    >(
      () => ({
        ariaLabel:
          props.ariaLabel ??
          "Code editor",
        automaticLayout: true,
        domReadOnly: readOnly,
        folding: !compact,
        fontSize: compact ? 14 : 13,
        formatOnPaste: false,
        formatOnType: false,
        glyphMargin: false,
        hideCursorInOverviewRuler: true,
        lineDecorationsWidth:
          compact ? 8 : 10,
        lineNumbers:
          compact ? "off" : "on",
        lineNumbersMinChars:
          compact ? 2 : 3,
        minimap: {
          enabled: false,
        },
        overviewRulerBorder: false,
        padding: {
          top: 12,
          bottom: 16,
        },
        readOnly,
        readOnlyMessage: {
          value: "",
        },
        renderLineHighlight:
          compact ? "none" : "line",
        scrollBeyondLastLine: false,
        scrollbar: {
          alwaysConsumeMouseWheel:
            false,
          horizontalScrollbarSize:
            compact ? 10 : 12,
          verticalScrollbarSize:
            compact ? 10 : 12,
        },
        stickyScroll: {
          enabled: false,
        },
        wordWrap: "on",
      }),
      [
        compact,
        props.ariaLabel,
        readOnly,
      ],
    );

  return (
    <div
      className={[
        "zoe-controlled-code-editor",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-model-path={path}
    >
      <Editor
        key={path}
        height={props.height ?? 360}
        path={path}
        language={language}
        defaultValue={String(
          props.value ?? "",
        )}
        theme={
          props.theme ?? "vs-dark"
        }
        saveViewState
        keepCurrentModel={false}
        loading={
          <div
            className="zoe-controlled-code-editor-loading"
            aria-busy="true"
          >
            Loading editor…
          </div>
        }
        onMount={(instance) => {
          editorRef.current =
            instance;
        }}
        onChange={(value) => {
          if (
            readOnly ||
            applyingExternalRef.current
          ) {
            return;
          }

          props.onChange(value ?? "");
        }}
        options={options}
      />
    </div>
  );
}
