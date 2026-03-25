"use client";

import React, { useEffect, useRef } from "react";
import type { Vec3 } from "@/lib/practice/types";

type Props = {
  initialA: Vec3;
  initialB?: Vec3;
  lockB?: boolean;
  scale?: number; // px per unit
  gridStep?: number;
  snap?: boolean;
  onChange?: (a: Vec3, b?: Vec3) => void;
  showHud?: boolean;
};

const COLORS = {
  bg: "#0b0d12",
  grid: "rgba(255,255,255,0.07)",
  axis: "rgba(255,255,255,0.18)",
  a: "#7aa2ff",
  b: "#ff6bd6",
  text: "rgba(255,255,255,0.75)",
};

export default function VectorPad2D({
  initialA,
  initialB,
  lockB = false,
  scale = 40,
  gridStep = 1,
  snap = true,
  onChange,
  showHud = true,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const p5Ref = useRef<any>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    let cancelled = false;

    (async () => {
      const mod = await import("p5");
      const P5 = (mod as any).default;
      if (cancelled) return;

      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }

      const sketch = (s: any) => {
        let W = 600;
        let H = 420;

        let a: Vec3 = { ...initialA, z: 0 };
        let b: Vec3 = initialB ? { ...initialB, z: 0 } : { x: 2, y: 1, z: 0 };

        type Drag = "a" | "b" | null;
        let dragging: Drag = null;

        const getSize = () => {
          const r = mountRef.current!.getBoundingClientRect();
          return { w: Math.max(320, r.width), h: Math.max(320, r.height) };
        };

        const origin = () => ({ x: W / 2, y: H / 2 });

        const worldToScreen = (v: Vec3) => {
          const o = origin();
          return { x: o.x + v.x * scale, y: o.y - v.y * scale };
        };

        const screenToWorld = (px: number, py: number): Vec3 => {
          const o = origin();
          return { x: (px - o.x) / scale, y: (o.y - py) / scale, z: 0 };
        };

        const maybeSnap = (v: Vec3, shiftDown: boolean) => {
          if (!snap) return v;
          if (shiftDown) return v;
          const step = Math.max(0.1, gridStep);
          return {
            x: Math.round(v.x / step) * step,
            y: Math.round(v.y / step) * step,
            z: 0,
          };
        };

        const drawGrid = () => {
          s.push();
          const step = Math.max(0.25, gridStep);
          const pxStep = step * scale;
          const o = origin();

          s.stroke(COLORS.grid);
          s.strokeWeight(1);

          const maxX = Math.ceil(W / pxStep) + 2;
          const maxY = Math.ceil(H / pxStep) + 2;

          for (let i = -maxX; i <= maxX; i++) s.line(o.x + i * pxStep, 0, o.x + i * pxStep, H);
          for (let j = -maxY; j <= maxY; j++) s.line(0, o.y + j * pxStep, W, o.y + j * pxStep);

          s.stroke(COLORS.axis);
          s.strokeWeight(2);
          s.line(0, o.y, W, o.y);
          s.line(o.x, 0, o.x, H);
          s.pop();
        };

        const drawArrow = (v: Vec3, col: string) => {
          const o = origin();
          const tip = worldToScreen(v);

          s.push();
          s.stroke(col);
          s.strokeWeight(4);
          s.line(o.x, o.y, tip.x, tip.y);

          const ang = Math.atan2(tip.y - o.y, tip.x - o.x);
          const head = 12;
          s.push();
          s.translate(tip.x, tip.y);
          s.rotate(ang);
          s.line(0, 0, -head, -head * 0.55);
          s.line(0, 0, -head, head * 0.55);
          s.pop();

          s.noStroke();
          s.fill(col);
          s.circle(tip.x, tip.y, 14);
          s.fill("rgba(0,0,0,0.35)");
          s.circle(tip.x, tip.y, 6);

          s.pop();
        };

        const isNearTip = (v: Vec3, mx: number, my: number, r = 18) => {
          const t = worldToScreen(v);
          const dx = t.x - mx;
          const dy = t.y - my;
          return dx * dx + dy * dy <= r * r;
        };

        const emit = () => {
          onChange?.({ ...a }, initialB ? { ...b } : undefined);
        };

        s.setup = () => {
          const { w, h } = getSize();
          W = w;
          H = h;
          s.createCanvas(W, H);
          (s.canvas as any).style.touchAction = "none";
          s.textFont("ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto");
          emit();
        };

        s.windowResized = () => {
          const { w, h } = getSize();
          W = w;
          H = h;
          s.resizeCanvas(W, H);
        };

        s.draw = () => {
          s.background(COLORS.bg);
          drawGrid();

          drawArrow(b, COLORS.b);
          drawArrow(a, COLORS.a);

          if (showHud) {
            s.push();
            s.noStroke();
            s.fill(COLORS.text);
            s.textSize(12);
            s.textAlign(s.LEFT, s.TOP);
            s.text("Drag tips • Shift = no snap", 12, 12);
            s.text(`a=(${a.x.toFixed(2)}, ${a.y.toFixed(2)})`, 12, 28);
            s.text(`b=(${b.x.toFixed(2)}, ${b.y.toFixed(2)})`, 12, 44);
            s.pop();
          }
        };

        s.mousePressed = () => {
          const mx = s.mouseX;
          const my = s.mouseY;

          if (isNearTip(a, mx, my)) dragging = "a";
          else if (!lockB && isNearTip(b, mx, my)) dragging = "b";
          else dragging = null;
        };

        s.mouseDragged = () => {
          if (!dragging) return;
          const w = screenToWorld(s.mouseX, s.mouseY);
          const shiftDown = s.keyIsDown(16);
          const snapped = maybeSnap(w, shiftDown);

          if (dragging === "a") a = snapped;
          if (dragging === "b" && !lockB) b = snapped;

          emit();
        };

        s.mouseReleased = () => {
          dragging = null;
        };
      };

      p5Ref.current = new P5(sketch, mountRef.current);
    })();

    return () => {
      cancelled = true;
      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }
    };
  }, [initialA.x, initialA.y, initialB?.x, initialB?.y, lockB, scale, gridStep, snap, onChange, showHud]);

  return <div ref={mountRef} className="h-[420px] w-full rounded-2xl border border-white/10 overflow-hidden bg-black/20" />;
}
