// import type p5 from "p5";
// import { COLORS, angleBetween, projOfAonB, radToDeg, safeUnit } from "@/lib/math/vec3";
// import type { VectorPadState, DragReason, HandleMask } from "../types";
// import type { Vec3 } from "@/lib/math/vec3";

// type Opts = {
//   getSize: () => { w: number; h: number };
//   stateRef: React.MutableRefObject<VectorPadState>;
//   pushVectors: (a: Vec3, b: Vec3, reason: DragReason) => void;
//   handles?: HandleMask;
// };

export function createVectorSketch2D() {
//   return (s: p5) => {
//     const handles = opts.handles ?? { a: true, b: true };

//     let W = 800;
//     let H = 600;

//     const origin = () => ({ x: W / 2, y: H / 2 });

//     const worldToScreen = (v: Vec3) => {
//       const o = origin();
//       return {
//         x: o.x + v.x * opts.stateRef.current.scale,
//         y: o.y - v.y * opts.stateRef.current.scale,
//       };
//     };

//     const screenToWorld = (px: number, py: number): Vec3 => {
//       const o = origin();
//       return {
//         x: (px - o.x) / opts.stateRef.current.scale,
//         y: (o.y - py) / opts.stateRef.current.scale,
//         z: 0,
//       };
//     };

//     type DragTarget = "a" | "b" | null;
//     let dragging: DragTarget = null;

//     const dist2 = (ax: number, ay: number, bx: number, by: number) => {
//       const dx = ax - bx;
//       const dy = ay - by;
//       return dx * dx + dy * dy;
//     };

//     const maybeSnap = (v: Vec3, shiftDown: boolean) => {
//       if (!opts.stateRef.current.snapToGrid) return v;
//       if (shiftDown) return v;
//       const step = Math.max(0.1, opts.stateRef.current.gridStep);
//       return { x: Math.round(v.x / step) * step, y: Math.round(v.y / step) * step, z: 0 };
//     };

//     const drawArrow = (
//       from: { x: number; y: number },
//       to: { x: number; y: number },
//       col: string,
//       weight = 3
//     ) => {
//       s.push();
//       s.stroke(col);
//       s.strokeWeight(weight);
//       s.noFill();
//       s.line(from.x, from.y, to.x, to.y);

//       const ang = Math.atan2(to.y - from.y, to.x - from.x);
//       const headLen = 12;
//       s.push();
//       s.translate(to.x, to.y);
//       s.rotate(ang);
//       s.line(0, 0, -headLen, -headLen * 0.55);
//       s.line(0, 0, -headLen, headLen * 0.55);
//       s.pop();
//       s.pop();
//     };

//     const drawHandle = (pos: { x: number; y: number }, col: string) => {
//       s.push();
//       s.noStroke();
//       s.fill(col);
//       s.circle(pos.x, pos.y, 14);
//       s.fill("rgba(0,0,0,0.35)");
//       s.circle(pos.x, pos.y, 6);
//       s.pop();
//     };

//     const drawGrid = () => {
//       if (!opts.stateRef.current.showGrid) return;
//       s.push();

//       const step = Math.max(0.25, opts.stateRef.current.gridStep);
//       const pxStep = step * opts.stateRef.current.scale;
//       const o = origin();

//       s.stroke(COLORS.grid);
//       s.strokeWeight(1);

//       const maxX = Math.ceil(W / pxStep) + 2;
//       const maxY = Math.ceil(H / pxStep) + 2;

//       for (let i = -maxX; i <= maxX; i++) s.line(o.x + i * pxStep, 0, o.x + i * pxStep, H);
//       for (let j = -maxY; j <= maxY; j++) s.line(0, o.y + j * pxStep, W, o.y + j * pxStep);

//       s.stroke(COLORS.axis);
//       s.strokeWeight(2);
//       s.line(0, o.y, W, o.y);
//       s.line(o.x, 0, o.x, H);

//       s.pop();
//     };

//     const drawComponents = (v: Vec3, col: string) => {
//       if (!opts.stateRef.current.showComponents) return;
//       const o = origin();
//       const tip = worldToScreen(v);
//       const xComp = worldToScreen({ x: v.x, y: 0, z: 0 });

//       s.push();
//       s.strokeWeight(2);
//       s.stroke(col);
//       s.line(o.x, o.y, xComp.x, xComp.y);
//       s.line(xComp.x, xComp.y, tip.x, tip.y);
//       s.pop();
//     };

//     const drawAngleArc = (aV: Vec3, bV: Vec3) => {
//       if (!opts.stateRef.current.showAngle) return;
//       const ang = angleBetween(aV, bV);
//       if (!Number.isFinite(ang)) return;

//       const aAng = Math.atan2(aV.y, aV.x);
//       const bAng = Math.atan2(bV.y, bV.x);
//       let d = aAng - bAng;
//       while (d > Math.PI) d -= 2 * Math.PI;
//       while (d < -Math.PI) d += 2 * Math.PI;

//       const o = origin();
//       const r = 48;
//       const start = -bAng;
//       const end = -(bAng + d);

//       s.push();
//       s.noFill();
//       s.stroke("rgba(255,255,255,0.35)");
//       s.strokeWeight(2);
//       s.arc(o.x, o.y, r * 2, r * 2, start, end);

//       const mid = (start + end) / 2;
//       const lx = o.x + Math.cos(mid) * (r + 16);
//       const ly = o.y + Math.sin(mid) * (r + 16);

//       s.noStroke();
//       s.fill(COLORS.text);
//       s.textSize(12);
//       s.textAlign(s.CENTER, s.CENTER);
//       s.text(`θ = ${radToDeg(Math.abs(d)).toFixed(1)}°`, lx, ly);

//       s.pop();
//     };

//     const drawProjection = (aV: Vec3, bV: Vec3) => {
//       if (!opts.stateRef.current.showProjection) return;
//       const pr = projOfAonB(aV, bV);
//       if (!Number.isFinite(pr.x) || !Number.isFinite(pr.y)) return;

//       const o = origin();
//       const aTip = worldToScreen(aV);
//       const prTip = worldToScreen(pr);

//       drawArrow(o, prTip, COLORS.proj, 4);

//       s.push();
//       s.stroke(opts.stateRef.current.showPerp ? COLORS.perp : "rgba(255,255,255,0.18)");
//       s.strokeWeight(opts.stateRef.current.showPerp ? 3 : 2);
//       if (!opts.stateRef.current.showPerp) {
//         // dashed
//         const steps = 10;
//         for (let i = 0; i < steps; i++) {
//           const t0 = i / steps;
//           const t1 = (i + 0.5) / steps;
//           s.line(
//             prTip.x + (aTip.x - prTip.x) * t0,
//             prTip.y + (aTip.y - prTip.y) * t0,
//             prTip.x + (aTip.x - prTip.x) * t1,
//             prTip.y + (aTip.y - prTip.y) * t1
//           );
//         }
//       } else {
//         s.line(prTip.x, prTip.y, aTip.x, aTip.y);
//       }
//       s.pop();

//       s.push();
//       s.noStroke();
//       s.fill(COLORS.proj);
//       s.textSize(12);
//       s.textAlign(s.LEFT, s.CENTER);
//       s.text("proj₍b₎(a)", prTip.x + 10, prTip.y);
//       s.pop();
//     };

//     const drawUnitB = (bV: Vec3) => {
//       if (!opts.stateRef.current.showUnitB) return;
//       const ub = safeUnit(bV);
//       if (!ub) return;

//       const o = origin();
//       const tip = worldToScreen(ub);
//       drawArrow(o, tip, "rgba(255,255,255,0.75)", 3);

//       s.push();
//       s.noStroke();
//       s.fill("rgba(255,255,255,0.85)");
//       s.textSize(12);
//       s.textAlign(s.LEFT, s.CENTER);
//       s.text("û_b", tip.x + 10, tip.y);
//       s.pop();
//     };

//     s.setup = () => {
//       const { w, h } = opts.getSize();
//       W = Math.floor(w);
//       H = Math.floor(h);
//       s.createCanvas(W, H);
//       s.pixelDensity(1); // helps “blink” on some GPUs
//       (s.canvas as any).style.touchAction = "none";
//       s.textFont("ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial");
//     };

//     s.windowResized = () => {
//       const { w, h } = opts.getSize();
//       const nw = Math.floor(w);
//       const nh = Math.floor(h);
//       if (nw === W && nh === H) return;
//       W = nw;
//       H = nh;
//       s.resizeCanvas(W, H);
//     };

//     s.draw = () => {
//       s.background(COLORS.bg);

//       const st = opts.stateRef.current;
//       const o = origin();

//       drawGrid();
//       drawUnitB(st.b);
//       drawComponents(st.a, "rgba(122,162,255,0.55)");
//       drawComponents(st.b, "rgba(255,107,214,0.55)");
//       drawProjection(st.a, st.b);
//       drawAngleArc(st.a, st.b);

//       drawArrow(o, worldToScreen(st.a), COLORS.a, 4);
//       drawArrow(o, worldToScreen(st.b), COLORS.b, 4);

//       drawHandle(worldToScreen(st.a), COLORS.a);
//       drawHandle(worldToScreen(st.b), COLORS.b);
//     };

//     s.mousePressed = () => {
//       const st = opts.stateRef.current;
//       const aTip = worldToScreen(st.a);
//       const bTip = worldToScreen(st.b);
//       const mx = s.mouseX;
//       const my = s.mouseY;
//       const r2 = 14 * 14;

//       const hitA = dist2(mx, my, aTip.x, aTip.y) <= r2 && handles.a !== false;
//       const hitB = dist2(mx, my, bTip.x, bTip.y) <= r2 && handles.b !== false;

//       if (hitA) dragging = "a";
//       else if (hitB) dragging = "b";
//       else dragging = null;
//     };

//     s.mouseDragged = () => {
//       if (!dragging) return;

//       const st = opts.stateRef.current;
//       const w = screenToWorld(s.mouseX, s.mouseY);
//       const shiftDown = s.keyIsDown(16);
//       const snapped = maybeSnap(w, shiftDown);

//       if (dragging === "a") opts.pushVectors(snapped, st.b, "drag");
//       else opts.pushVectors(st.a, snapped, "drag");
//     };

//     s.mouseReleased = () => {
//       if (!dragging) return;
//       dragging = null;
//       const st = opts.stateRef.current;
//       opts.pushVectors({ ...st.a }, { ...st.b }, "commit");
//     };
//   };
}
