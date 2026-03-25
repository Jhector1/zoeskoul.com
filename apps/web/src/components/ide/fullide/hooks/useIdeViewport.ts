"use client";

import { useEffect, useState } from "react";

type Args = {
  height: number;
  activeFileId: string | null;
  showMobileExplorer: boolean;
  isDesktopForcedOff?: boolean;
  editorHostRef: React.RefObject<HTMLDivElement | null>;
  onCloseMobileExplorer: () => void;
};

export function useIdeViewport({
  height,
  activeFileId,
  showMobileExplorer,
  isDesktopForcedOff = false,
  editorHostRef,
  onCloseMobileExplorer,
}: Args) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [editorHeight, setEditorHeight] = useState(height);

  useEffect(() => {
    if (isDesktopForcedOff) {
      setIsDesktop(false);
      return;
    }

    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);

    apply();

    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }

    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, [isDesktopForcedOff]);

  useEffect(() => {
    if (isDesktop) onCloseMobileExplorer();
  }, [isDesktop, onCloseMobileExplorer]);

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
      if (e.key === "Escape") onCloseMobileExplorer();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMobileExplorer, onCloseMobileExplorer]);

  useEffect(() => {
    const el = editorHostRef.current;
    if (!el) return;

    const measure = () => {
      const next = Math.floor(el.getBoundingClientRect().height);
      setEditorHeight(next > 0 ? next : height);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [height, isDesktop, showMobileExplorer, activeFileId, editorHostRef]);

  return {
    isDesktop,
    editorHeight,
  };
}
