// src/lib/practice/api/validate/grade/index.ts
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";

import { gradeNumeric } from "./numeric";
import { gradeSingleChoice } from "./singleChoice";
import { gradeMultiChoice } from "./multiChoice";
import { gradeMatrixInput } from "./matrixInput";
import { gradeVectorDragTarget } from "./vectorDragTarget";
import { gradeVectorDragDot } from "./vectorDragDot";
import { gradeCodeInput } from "./codeInput";
import { gradeTextInput } from "./textInput";
import { gradeDragReorder } from "./dragReorder";
import { gradeVoiceInput } from "./voiceInput";
import {gradeSentenceBuild} from "@/lib/practice/api/validate/grade/sentenceBuild";
import {gradeFillBlankChoice} from "@/lib/practice/api/validate/grade/fillBlankChoice";

export type GradeResult = {
  ok: boolean;
  explanation: string;
  revealAnswer: any | null;
};

export async function gradeInstance(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
  showDebug: boolean;
}): Promise<GradeResult> {
  switch (args.instance.kind) {
    case "numeric":
      return gradeNumeric(args as any);

    case "single_choice":
      return gradeSingleChoice(args as any);

    case "multi_choice":
      return gradeMultiChoice(args as any);

    case "matrix_input":
      return gradeMatrixInput(args as any);

    case "vector_drag_target":
      return gradeVectorDragTarget(args as any);

    case "vector_drag_dot":
      return gradeVectorDragDot(args as any);

    case "code_input":
      return gradeCodeInput(args as any);

    case "text_input":
      return gradeTextInput(args as any);

    case "drag_reorder":
      return gradeDragReorder(args as any);

    case "voice_input":
      return gradeVoiceInput(args as any);
      // ✅ NEW
    case "word_bank_arrange":
      return gradeSentenceBuild(args as any);

    case "listen_build":
      return gradeSentenceBuild(args as any);

    case "fill_blank_choice":
      return gradeFillBlankChoice(args as any);
    default:
      return {
        ok: false,
        revealAnswer: null,
        explanation: `Unsupported instance kind: ${String(args.instance.kind)}`,
      };
  }
}