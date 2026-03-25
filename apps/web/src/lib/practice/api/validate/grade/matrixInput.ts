// src/lib/practice/validate/grade/matrixInput.ts
import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";
import { compareMatrix } from "../utils/math";
import { matrixToLatex } from "../utils/latex";

export function gradeMatrixInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const tol = Number(
    args.expectedCanon.tolerance ??
      (args.instance.publicPayload as any)?.tolerance ??
      0,
  );

  const rawExp = args.expectedCanon?.values;

  if (!Array.isArray(rawExp) || !Array.isArray(rawExp[0])) {
    return {
      ok: false,
      revealAnswer: null,
      explanation: "Server bug: matrix_input expected.values is missing or not 2D.",
    };
  }

  const expValues: number[][] = rawExp.map((row: any[]) =>
    row.map((v: any) => Number(v)),
  );

  if (args.isReveal) {
    return {
      ok: false,
      revealAnswer: {
        kind: "matrix_input",
        values: expValues,
        latex: matrixToLatex(expValues),
        labelLatex:
          (args.instance.publicPayload as any)?.labelLatex ??
          String.raw`\mathbf{A}=`,
      },
      explanation: "Solution shown.",
    };
  }

  const got: number[][] = Array.isArray((args.answer as any)?.values)
    ? (args.answer as any).values
    : [];

  const cmp = compareMatrix(got, expValues, tol);
  const ok = cmp.ok;

  const explanation = ok
    ? "Correct."
    : cmp.shapeOk
      ? `One or more entries differ by more than ${tol}.`
      : `Wrong shape. Expected ${expValues.length}×${expValues[0].length}, got ${got.length}×${got[0]?.length ?? 0}.`;

  return { ok, revealAnswer: null, explanation };
}
