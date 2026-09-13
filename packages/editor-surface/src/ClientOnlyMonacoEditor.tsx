"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useState,
} from "react";
import type { EditorProps } from "@monaco-editor/react";

const LazyMonacoEditor = lazy(async () => {
  const module = await import("@monaco-editor/react");
  return { default: module.default };
});

export type ClientOnlyMonacoEditorProps = EditorProps;

export function ClientOnlyMonacoEditor(
  props: ClientOnlyMonacoEditorProps,
) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{props.loading ?? null}</>;
  }

  return (
    <Suspense fallback={props.loading ?? null}>
      <LazyMonacoEditor {...props} />
    </Suspense>
  );
}
