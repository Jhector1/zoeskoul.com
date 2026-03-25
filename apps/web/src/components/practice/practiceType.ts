// import { Exercise, TopicSlug, ValidateResponse, Vec3 } from "@/lib/practice/types";

export type TopicValue = TopicSlug | "all";

import type { CodeLanguage, Exercise, TopicSlug, ValidateResponse, Vec3 } from "@/lib/practice/types";

export type QItem = {
  key: string;
  exercise: Exercise;

  single: string;
  multi: string[];
  num: string;

  dragA: Vec3;
  dragB: Vec3;

  matRows: number;
  matCols: number;
  mat: string[][];

  result: ValidateResponse | null;
  submitted: boolean;
  revealed?: boolean;
  attempts?: number;

  // ✅ code_input
  code: string;
  codeLang: CodeLanguage | "python" | "java"; // keep old allowed values
  codeStdin: string;

  // ✅ (optional legacy alias; ok to keep)
  stdin?: string;

  // ✅ text_input / reorder / voice_input
  text: string;

  // drag_reorder: you currently use reorderIds; keep both but be consistent
  reorderIds: string[];       // token ids (base set)
  reorder: string[];          // current order (ids)

  voiceTranscript: string;
  voiceAudioId?: string;

  // optional UI outputs
  codeRunOutput?: string;
};

// export type MissedItem = {
//   id: string;
//   at: number;
//   topic: TopicSlug;
//   kind: Exercise["kind"];
//   title: string;
//   prompt: string;
//   userAnswer: any;
//   expected: any;
//   explanation?: string | null;
// };
export type MissedItem = {
  id: string;
  at: number;
  topic: TopicSlug;
  kind: string;
  title: string;
    publicPayload?: any;

  prompt: string;
  userAnswer: any;
  expected: any;
  explanation?: string | null;
};
