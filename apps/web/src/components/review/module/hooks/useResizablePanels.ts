"use client";

import { useEffect, useRef, useState } from "react";
import { clamp } from "../utils";

export function useResizablePanels(args?: {
    leftDefault?: number;
    rightDefault?: number;
    leftMin?: number;
    leftMax?: number;
    rightMin?: number;
    rightMax?: number;
}) {
    const {
        leftDefault = 300,
        rightDefault = 520,
        leftMin = 220,
        leftMax = 520,
        rightMin = 320,
        rightMax = 820,
    } = args ?? {};

    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);

    const [leftW, setLeftW] = useState(leftDefault);
    const [rightW, setRightW] = useState(rightDefault);

    const draggingRef = useRef<
        null | { kind: "left" | "right"; startX: number; startW: number }
    >(null);

    useEffect(() => {
        function onMove(e: MouseEvent) {
            const d = draggingRef.current;
            if (!d) return;

            if (d.kind === "left") {
                const next = d.startW + (e.clientX - d.startX);
                setLeftW(clamp(next, leftMin, leftMax));
            } else {
                const next = d.startW + (d.startX - e.clientX);
                setRightW(clamp(next, rightMin, rightMax));
            }
        }

        function onUp() {
            draggingRef.current = null;
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [leftMin, leftMax, rightMin, rightMax]);

    const onMouseDownLeftHandle = (e: React.MouseEvent) => {
        e.preventDefault();
        draggingRef.current = { kind: "left", startX: e.clientX, startW: leftW };
    };

    const onMouseDownRightHandle = (e: React.MouseEvent) => {
        e.preventDefault();
        draggingRef.current = { kind: "right", startX: e.clientX, startW: rightW };
    };

    return {
        leftCollapsed,
        setLeftCollapsed,
        rightCollapsed,
        setRightCollapsed,
        leftW,
        setLeftW,
        rightW,
        setRightW,
        onMouseDownLeftHandle,
        onMouseDownRightHandle,
    };
}
