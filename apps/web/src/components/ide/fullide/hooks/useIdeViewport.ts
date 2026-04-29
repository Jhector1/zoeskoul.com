"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Args = {
  height: number;
  activeFileId: string | null;
  showMobileExplorer: boolean;
  forceDesktopLayout?: boolean;
  isDesktopForcedOff?: boolean;
  editorHostRef: React.RefObject<HTMLDivElement | null>;
  onCloseMobileExplorer: () => void;
};

function safeHeight(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const next = Math.floor(value);
  return next > 0 ? next : fallback;
}

export function useIdeViewport({
  height,
  activeFileId,
  showMobileExplorer,
  forceDesktopLayout = false,
  isDesktopForcedOff = false,
  editorHostRef,
  onCloseMobileExplorer,
}: Args) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [editorHeight, setEditorHeight] = useState(height);

  const heightRef = useRef(height);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const onCloseMobileExplorerRef = useRef(onCloseMobileExplorer);

  heightRef.current = height;
  onCloseMobileExplorerRef.current = onCloseMobileExplorer;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (forceDesktopLayout) {
      setIsDesktop((prev) => (prev === true ? prev : true));
      return;
    }

    if (isDesktopForcedOff) {
      setIsDesktop((prev) => (prev === false ? prev : false));
      return;
    }

    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      const next = mq.matches;
      setIsDesktop((prev) => (prev === next ? prev : next));
    };

    apply();

    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }

    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, [forceDesktopLayout, isDesktopForcedOff]);

  useEffect(() => {
    if (isDesktop) onCloseMobileExplorerRef.current();
  }, [isDesktop]);

  useEffect(() => {
    if (!showMobileExplorer || isDesktop) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [showMobileExplorer, isDesktop]);

  useEffect(() => {
    if (!showMobileExplorer) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobileExplorerRef.current();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMobileExplorer]);

  const measureNow = useCallback(() => {
    if (!mountedRef.current) return;

    const el = editorHostRef.current;
    if (!el) return;

    const next = safeHeight(el.getBoundingClientRect().height, heightRef.current);

    setEditorHeight((prev) => (prev === next ? prev : next));
  }, [editorHostRef]);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current != null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measureNow();
    });
  }, [measureNow]);

  useEffect(() => {
    const el = editorHostRef.current;
    if (!el) {
      setEditorHeight((prev) => (prev === height ? prev : height));
      return;
    }

    scheduleMeasure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleMeasure);

      return () => {
        window.removeEventListener("resize", scheduleMeasure);

        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }

    const ro = new ResizeObserver(() => {
      scheduleMeasure();
    });

    ro.observe(el);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", scheduleMeasure);

      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    height,
    activeFileId,
    showMobileExplorer,
    isDesktop,
    editorHostRef,
    scheduleMeasure,
  ]);

  return {
    isDesktop,
    editorHeight,
  };
}
