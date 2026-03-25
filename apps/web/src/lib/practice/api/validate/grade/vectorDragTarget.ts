// src/lib/practice/validate/grade/vectorDragTarget.ts
import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";
import { closeEnough } from "../utils/math";
import { vecToLatex } from "../utils/latex";

export function gradeVectorDragTarget(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const tol = Number(
    args.expectedCanon.tolerance ??
      (args.instance.publicPayload as any)?.tolerance ??
      0.15,
  );

  const targetA = args.expectedCanon.targetA ?? args.expectedCanon.solutionA;
  const tx = Number(targetA?.x ?? 0);
  const ty = Number(targetA?.y ?? 0);

  if (args.isReveal) {
    return {
      ok: false,
      revealAnswer: {
        kind: "vector_drag_target",
        solutionA: { x: tx, y: ty, z: 0 },
        latex: vecToLatex({ x: tx, y: ty, z: 0 }),
      },
      explanation: `Solution shown. Drag a to (${tx}, ${ty}).`,
    };
  }

  const a = (args.answer as any)?.a;

  const ok =
    !!a &&
    closeEnough(Number(a.x), tx, tol) &&
    closeEnough(Number(a.y), ty, tol);

  return {
    ok,
    revealAnswer: null,
    explanation: ok ? "Nice drag accuracy." : `Get closer to (${tx}, ${ty}).`,
  };
}
