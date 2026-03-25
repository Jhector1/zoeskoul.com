// src/lib/practice/validate/grade/vectorDragDot.ts
import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";
import { closeEnough, solutionForDot } from "../utils/math";
import { vecToLatex } from "../utils/latex";

export function gradeVectorDragDot(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const targetDot = Number(args.expectedCanon.targetDot ?? 0);
  const b = args.expectedCanon.b ?? (args.instance.publicPayload as any)?.b;
  const tol = Number(
    args.expectedCanon.tolerance ??
      (args.instance.publicPayload as any)?.tolerance ??
      0.5,
  );
  const minMag = Number(args.expectedCanon.minMag ?? 0.25);

  const solutionA = b ? solutionForDot(b, targetDot, minMag) : null;

  if (args.isReveal) {
    return {
      ok: false,
      revealAnswer: {
        kind: "vector_drag_dot",
        b,
        solutionA,
        targetDot,
        latex: solutionA ? vecToLatex(solutionA) : null,
      },
      explanation: solutionA
        ? `One valid answer is shown (a·b = ${targetDot}).`
        : "Missing b (cannot compute reveal solution).",
    };
  }

  const a = (args.answer as any)?.a;
  if (!a || !b) {
    return {
      ok: false,
      revealAnswer: null,
      explanation: "Missing vector data (a or b).",
    };
  }

  const ax = Number(a.x),
    ay = Number(a.y),
    az = Number(a.z ?? 0);
  const bx = Number(b.x),
    by = Number(b.y),
    bz = Number(b.z ?? 0);

  const dot = ax * bx + ay * by + az * bz;

  const EPS = 1e-12;
  const a2 = ax * ax + ay * ay + az * az;
  const min2 = minMag * minMag;

  if (!Number.isFinite(a2) || a2 < min2 - EPS) {
    return {
      ok: false,
      revealAnswer: null,
      explanation: `a cannot be the zero vector (|a| must be ≥ ${minMag}).`,
    };
  }

  const ok = closeEnough(dot, targetDot, tol);

  return {
    ok,
    revealAnswer: null,
    explanation: ok
      ? "Correct."
      : `Your a·b = ${dot.toFixed(2)}. Aim for ${targetDot} ± ${tol}.`,
  };
}
