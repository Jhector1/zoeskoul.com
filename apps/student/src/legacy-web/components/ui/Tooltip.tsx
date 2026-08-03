"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";

type Side = "top" | "bottom";

function cx(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
}

export default function Tooltip({
                                    tip,
                                    side = "bottom",
                                    offset = 10,
                                    disabled = false,
                                    belowLgOnly = false,
                                    children,
                                }: {
    tip: string;
    side?: Side;
    offset?: number;
    disabled?: boolean;
    belowLgOnly?: boolean;
    children: React.ReactNode;
}) {
    const triggerRef = useRef<HTMLSpanElement | null>(null);
    const tipRef = useRef<HTMLDivElement | null>(null);

    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    useEffect(() => setMounted(true), []);

    const compute = () => {
        const trigger = triggerRef.current;
        const tipEl = tipRef.current;
        if (!trigger || !tipEl) return;

        const r = trigger.getBoundingClientRect();
        const tw = tipEl.offsetWidth;
        const th = tipEl.offsetHeight;

        const cxMid = r.left + r.width / 2;

        let top = side === "bottom" ? r.bottom + offset : r.top - offset - th;
        let left = cxMid - tw / 2;

        const pad = 8;
        left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
        top = Math.max(pad, Math.min(top, window.innerHeight - th - pad));

        setPos({ top, left });
    };

    useLayoutEffect(() => {
        if (!open) return;
        compute();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, tip, side, offset]);

    useEffect(() => {
        if (!open) return;

        const onScroll = () => compute();
        const onResize = () => compute();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };

        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        window.addEventListener("keydown", onKey);

        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("keydown", onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (disabled) return <>{children}</>;

    const tooltipNode =
        mounted && open
            ? createPortal(
                <div className={isDark ? "dark" : ""}>
                    <div
                        ref={tipRef}
                        role="tooltip"
                        className={cx("ui-tooltip", belowLgOnly && "ui-tooltip--below-lg")}
                        style={{ top: pos.top, left: pos.left }}
                    >
              <span
                  aria-hidden="true"
                  className={cx(
                      "ui-tooltip-arrow",
                      side === "bottom" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"
                  )}
              />
                        <span className="relative">{tip}</span>
                    </div>
                </div>,
                document.body
            )
            : null;

    return (
        <>
      <span
          ref={triggerRef}
          className="inline-flex"
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
      >
        {children}
      </span>
            {tooltipNode}
        </>
    );
}
