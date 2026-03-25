// src/lib/practice/api/validate/grade/dragReorder.ts
import type { GradeResult } from ".";
// import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";
import { z } from "zod";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";
import {SubmitAnswer} from "@/lib/practice/types";

// expectedCanon must store string IDs in exact correct order
const DragReorderExpectedSchema = z.object({
  kind: z.literal("drag_reorder").optional(),
  order: z.array(z.string().min(1)).min(1),
});

function toId(x: any): string | null {
  if (typeof x === "string") {
    const s = x.trim();
    return s ? s : null;
  }
  if (typeof x === "number" && Number.isFinite(x)) return String(x);

  if (x && typeof x === "object") {
    // tolerate common shapes if your generator stored objects
    const id =
        (typeof (x as any).id === "string" && (x as any).id) ||
        (typeof (x as any).value === "string" && (x as any).value) ||
        (typeof (x as any).key === "string" && (x as any).key) ||
        null;
    return id ? String(id).trim() : null;
  }

  return null;
}

function toIdList(v: any): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const id = toId(x);
    if (!id) return []; // strong: fail fast if any id is invalid
    out.push(id);
  }
  return out;
}

export function gradeDragReorder(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const parsed = DragReorderExpectedSchema.safeParse(args.expectedCanon);
  if (!parsed.success) {
    return {
      ok: false,
      revealAnswer: null,
      explanation: "Server bug: drag_reorder expected.order is missing/invalid.",
    };
  }

  const expectedOrder = parsed.data.order;
  const expectedSet = new Set(expectedOrder);

  // strong: expected must have unique ids
  if (expectedSet.size !== expectedOrder.length) {
    return {
      ok: false,
      revealAnswer: null,
      explanation: "Server bug: drag_reorder expected.order contains duplicates.",
    };
  }

  if (args.isReveal) {
    return {
      ok: false,
      revealAnswer: { kind: "drag_reorder", order: expectedOrder },
      explanation: "Solution shown.",
    };
  }

  // answer should already be validated by BodySchema, but we re-normalize defensively
  const order = toIdList((args.answer as any)?.order);

  if (!order.length) {
    return { ok: false, revealAnswer: null, explanation: "Missing order." };
  }

  // strong: user must submit a permutation of expected ids
  if (order.length !== expectedOrder.length) {
    return { ok: false, revealAnswer: null, explanation: "Not correct." };
  }

  const orderSet = new Set(order);
  if (orderSet.size !== order.length) {
    return { ok: false, revealAnswer: null, explanation: "Not correct." };
  }

  for (const id of order) {
    if (!expectedSet.has(id)) {
      return { ok: false, revealAnswer: null, explanation: "Not correct." };
    }
  }

  // strict positional compare
  const ok = order.every((id, i) => id === expectedOrder[i]);

  return {
    ok,
    revealAnswer: null,
    explanation: ok ? "Correct." : "Not correct.",
  };
}