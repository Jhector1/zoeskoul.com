// import type p5 from "p5";
// import { COLORS, projOfAonB, safeUnit, scalarProjOfAonB, mul } from "@/lib/math/vec3";
// import type { VectorPadState, DragReason, HandleMask } from "../types";
// import type { Vec3 } from "@/lib/math/vec3";

// type Opts = {
//   getSize: () => { w: number; h: number };
//   stateRef: React.MutableRefObject<VectorPadState>;
//   pushVectors: (a: Vec3, b: Vec3, reason: DragReason) => void;
//   zHeldRef: React.MutableRefObject<boolean>;
//   handles?: HandleMask;
// };

export function createVectorSketch3D() {
//   return (s: p5) => {
//     const handles = opts.handles ?? { a: true, b: true };

//     let W = 800;
//     let H = 600;

//     type DragTarget = "a" | "b" | null;
//     let dragging: DragTarget = null;
//     let lastMouse: { x: number; y: number } | null = null;

//     const dragSpeed = () => 1 / Math.max(20, opts.stateRef.current.scale);

//     const maybeSnap3 = (v: Vec3, shiftDown: boolean) => {
//       if (!opts.stateRef.current.snapToGrid) return v;
//       if (shiftDown) return v;
//       const step = Math.max(0.1, opts.stateRef.current.gridStep);
//       return { x: Math.round(v.x / step) * step, y: Math.round(v.y / step) * step, z: v.z };
//     };

//     const worldToScreen = (v: Vec3) => {
//       const sc = opts.stateRef.current.scale;
//       const px = v.x * sc;
//       const py = -v.y * sc;
//       const pz = v.z * sc;

//       const spFn = (s as any).screenPosition;
//       if (typeof spFn === "function") {
//         const sp = spFn.call(s, px, py, pz);
//         if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.y)) return { sx: sp.x, sy: sp.y };
//       }
//       return null;
//     };

//     const isNear = (sx: number, sy: number, mx: number, my: number, r = 18) => {
//       const dx = sx - mx;
//       const dy = sy - my;
//       return dx * dx + dy * dy <= r * r;
//     };

//     const labelAt = (v: Vec3, text: string, col: string) => {
//       const sp = worldToScreen(v);
//       if (!sp) return;
//       s.push();
//       s.resetMatrix();
//       s.translate(-W / 2, -H / 2);
//       s.noStroke();
//       s.fill(col);
//       s.textSize(12);
//       s.textAlign(s.LEFT, s.CENTER);
//       s.text(text, sp.sx + 10, sp.sy);
//       s.pop();
//     };

//     const drawAxis = () => {
//       if (!opts.stateRef.current.showGrid) return;

//       s.push();
//       s.strokeWeight(1);

//       s.stroke(COLORS.grid);
//       const step = Math.max(0.25, opts.stateRef.current.gridStep);
//       const worldStep = step * opts.stateRef.current.scale;
//       const half = 10 * worldStep;

//       for (let x = -half; x <= half; x += worldStep) s.line(x, -half, 0, x, half, 0);
//       for (let y = -half; y <= half; y += worldStep) s.line(-half, y, 0, half, y, 0);

//       s.stroke(COLORS.axis);
//       s.strokeWeight(2);
//       s.line(-half, 0, 0, half, 0, 0);
//       s.line(0, -half, 0, 0, half, 0);
//       s.line(0, 0, -half, 0, 0, half);

//       s.pop();
//     };

//     const drawVector = (v: Vec3, col: string) => {
//       const sc = opts.stateRef.current.scale;
//       s.push();
//       s.stroke(col);
//       s.strokeWeight(4);
//       s.line(0, 0, 0, v.x * sc, -v.y * sc, v.z * sc);
//       s.pop();
//     };

//     const drawHandleSphere = (v: Vec3, col: string) => {
//       const sc = opts.stateRef.current.scale;
//       s.push();
//       s.translate(v.x * sc, -v.y * sc, v.z * sc);
//       s.noStroke();
//       s.fill(col);
//       s.sphere(8, 14, 10);
//       s.pop();
//     };

//     const drawUnitB = (B: Vec3) => {
//       if (!opts.stateRef.current.showUnitB) return;
//       const ub = safeUnit(B);
//       if (!ub) return;

//       const sc = opts.stateRef.current.scale;
//       s.push();
//       s.stroke("rgba(255,255,255,0.75)");
//       s.strokeWeight(3);
//       s.line(0, 0, 0, ub.x * sc, -ub.y * sc, ub.z * sc);
//       s.pop();
//       labelAt(ub, "û_b", "rgba(255,255,255,0.85)");
//     };

//     const drawProjection = (A: Vec3, B: Vec3) => {
//       if (!opts.stateRef.current.showProjection) return;

//       const pr = projOfAonB(A, B);
//       if (!Number.isFinite(pr.x) || !Number.isFinite(pr.y) || !Number.isFinite(pr.z)) return;

//       const sc = opts.stateRef.current.scale;

//       s.push();
//       s.stroke(COLORS.proj);
//       s.strokeWeight(4);
//       s.line(0, 0, 0, pr.x * sc, -pr.y * sc, pr.z * sc);
//       s.pop();

//       s.push();
//       s.stroke(opts.stateRef.current.showPerp ? COLORS.perp : "rgba(255,255,255,0.18)");
//       s.strokeWeight(opts.stateRef.current.showPerp ? 3 : 2);
//       s.line(pr.x * sc, -pr.y * sc, pr.z * sc, A.x * sc, -A.y * sc, A.z * sc);
//       s.pop();

//       labelAt(pr, "proj_b(a)", COLORS.proj);
//     };

//     const drawShadow = (A: Vec3, B: Vec3) => {
//       const ub = safeUnit(B);
//       if (!ub) return;
//       const sp = scalarProjOfAonB(A, B);
//       if (!Number.isFinite(sp)) return;

//       const shadow = mul(ub, sp);
//       const sc = opts.stateRef.current.scale;

//       s.push();
//       s.stroke("rgba(255,255,255,0.55)");
//       s.strokeWeight(3);
//       s.line(0, 0, 0, shadow.x * sc, -shadow.y * sc, shadow.z * sc);
//       s.pop();

//       labelAt(shadow, `shadow = ${sp.toFixed(2)}`, "rgba(255,255,255,0.75)");
//     };

//     s.setup = () => {
//       const { w, h } = opts.getSize();
//       W = Math.floor(w);
//       H = Math.floor(h);
//       s.createCanvas(W, H, s.WEBGL);
//       s.pixelDensity(1); // reduces flicker on some setups

//       const c = s.canvas as any;
//       c.style.touchAction = "none";
//       c.tabIndex = 0;
//       c.style.outline = "none";
//       c.focus?.();
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
//       const A = st.a;
//       const B = st.b;
//       const zDown = st.depthMode || opts.zHeldRef.current || s.keyIsDown(90);

//       if (!dragging) (s as any).orbitControl?.(1, 1, 0.15);

//       s.ambientLight(120);
//       s.directionalLight(255, 255, 255, 0.2, 0.4, -1);

//       drawAxis();
//       drawVector(A, COLORS.a);
//       drawVector(B, COLORS.b);
//       drawUnitB(B);
//       drawShadow(A, B);
//       drawProjection(A, B);

//       drawHandleSphere(A, COLORS.a);
//       drawHandleSphere(B, COLORS.b);

//       labelAt(A, "a", COLORS.a);
//       labelAt(B, "b", COLORS.b);

//       // HUD inside canvas (optional)
//       s.push();
//       s.resetMatrix();
//       s.translate(-W / 2, -H / 2);
//       s.noStroke();
//       s.fill("rgba(255,255,255,0.75)");
//       s.textSize(12);
//       s.textAlign(s.LEFT, s.TOP);
//       s.text(`Depth: ${zDown ? "ON" : "off"}`, 12, 12);
//       s.pop();
//     };

//     s.mousePressed = () => {
//       (s.canvas as any).focus?.();

//       const st = opts.stateRef.current;
//       const aS = worldToScreen(st.a);
//       const bS = worldToScreen(st.b);

//       const mx1 = s.mouseX;
//       const my1 = s.mouseY;
//       const mx2 = s.mouseX + W / 2;
//       const my2 = s.mouseY + H / 2;

//       const near = (p: { sx: number; sy: number } | null) =>
//         !!p && (isNear(p.sx, p.sy, mx1, my1, 28) || isNear(p.sx, p.sy, mx2, my2, 28));

//       const canA = handles.a !== false;
//       const canB = handles.b !== false;

//       const nearA = canA && near(aS);
//       const nearB = canB && near(bS);

//       if (nearA && nearB) {
//         const da = (aS!.sx - mx1) ** 2 + (aS!.sy - my1) ** 2;
//         const db = (bS!.sx - mx1) ** 2 + (bS!.sy - my1) ** 2;
//         dragging = da <= db ? "a" : "b";
//       } else if (nearA) dragging = "a";
//       else if (nearB) dragging = "b";
//       else dragging = null;

//       lastMouse = dragging ? { x: s.mouseX, y: s.mouseY } : null;
//     };

//     s.mouseDragged = () => {
//       if (!dragging) return;

//       const st = opts.stateRef.current;
//       if (!lastMouse) lastMouse = { x: s.mouseX, y: s.mouseY };

//       const dx = s.mouseX - lastMouse.x;
//       const dy = s.mouseY - lastMouse.y;
//       lastMouse = { x: s.mouseX, y: s.mouseY };

//       const shiftDown = s.keyIsDown(16);
//       const zDown = st.depthMode || opts.zHeldRef.current || s.keyIsDown(90);

//       const spd = dragSpeed();
//       const zMult = 4;

//       const cur = dragging === "a" ? st.a : st.b;
//       let next: Vec3 = { ...cur };

//       if (zDown) next.z = cur.z + -dy * spd * zMult;
//       else {
//         next.x = cur.x + dx * spd;
//         next.y = cur.y + -dy * spd;
//       }

//       next = maybeSnap3(next, shiftDown);

//       if (dragging === "a") opts.pushVectors(next, st.b, "drag");
//       else opts.pushVectors(st.a, next, "drag");
//     };

//     s.mouseReleased = () => {
//       if (!dragging) return;
//       dragging = null;
//       lastMouse = null;
//       const st = opts.stateRef.current;
//       opts.pushVectors({ ...st.a }, { ...st.b }, "commit");
//     };
//   };
}
