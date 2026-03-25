import type { GradeResult } from ".";
import {LoadedValidateInstance} from "@/lib/practice/api/validate/repositories/instance.repo";import type { SubmitAnswer } from "../schemas";

function normLoose(s: string) {
  return String(s ?? "")
      .trim()
      .replace(/\s+/g, " ")
      // remove space before punctuation like . , ? ! : ;
      .replace(/\s+([.,!?;:])/g, "$1")
      // normalize apostrophes / quotes
      .replace(/[’‘]/g, "'")
      .replace(/\s+'/g, "'")
      .toLowerCase();
}

function uniqRaw(list: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function gradeTextInput(args: {
  instance: LoadedValidateInstance;
  expectedCanon: any;
  answer: SubmitAnswer | null;
  isReveal: boolean;
}): GradeResult {
  const match: "exact" | "includes" =
      args.expectedCanon?.match === "includes" ? "includes" : "exact";

  const expectedRaw =
      typeof args.expectedCanon?.value === "string"
          ? args.expectedCanon.value
          : typeof args.expectedCanon?.text === "string"
              ? args.expectedCanon.text
              : null;

  const acceptedRaw: string[] = Array.isArray(args.expectedCanon?.accepted)
      ? args.expectedCanon.accepted.filter((x: any) => typeof x === "string")
      : [];

  const answersRaw: string[] = Array.isArray(args.expectedCanon?.answers)
      ? args.expectedCanon.answers.filter((x: any) => typeof x === "string")
      : [];

  // ✅ raw list for reveal (human-friendly)
  const rawCandidates = uniqRaw([
    ...(expectedRaw ? [expectedRaw] : []),
    ...acceptedRaw,
    ...answersRaw,
  ]);

  // ✅ normalized list for matching (machine-friendly)
  const normCandidates = rawCandidates.map(normLoose).filter(Boolean);

  if (args.isReveal) {
    const shown = expectedRaw ?? rawCandidates[0] ?? "";
    return {
      ok: false,
      revealAnswer: {
        // ✅ IMPORTANT: match the instance kind (works for word_bank_arrange/listen_build/fill_blank_choice too)
        kind: String(args.instance.kind),
        value: shown,
        answers: rawCandidates.length ? rawCandidates : shown ? [shown] : [],
        match,
      },
      explanation: "Solution shown.",
    };
  }

  const received = (args.answer as any)?.value;
  if (typeof received !== "string" || !received.trim()) {
    return { ok: false, revealAnswer: null, explanation: "Missing text answer." };
  }

  // If expected is missing, record (keeps your current behavior)
  if (!normCandidates.length) {
    return { ok: true, revealAnswer: null, explanation: "Answer recorded." };
  }

  const r = normLoose(received);

  const ok =
      match === "includes"
          ? normCandidates.some((exp) => r.includes(exp))
          : normCandidates.includes(r);

  return {
    ok,
    revealAnswer: null,
    explanation: ok ? "Correct." : "Not correct.",
  };
}