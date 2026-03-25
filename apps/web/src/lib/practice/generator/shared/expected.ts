// src/lib/practice/generator/expected.ts
import type { Exercise, ExerciseKind, Vec3 } from "../../types";
import { PracticePurpose } from "@prisma/client";

// Expected payloads (grading only)
// Keep these shapes aligned with your validator.
export type ExpectedByKind = {
  numeric: { kind: "numeric"; value: number; tolerance: number };

  single_choice: { kind: "single_choice"; optionId: string };

  multi_choice: { kind: "multi_choice"; optionIds: string[] };

  matrix_input: {
    kind: "matrix_input";
    rows: number;
    cols: number;
    values: number[][];
    tolerance: number;
  };

  vector_drag_target: {
    kind: "vector_drag_target";
    targetA: Vec3;
    tolerance: number;
    lockB: boolean;
    // optional, only if you ever grade B too
    targetB?: Vec3;
  };

  vector_drag_dot: {
    kind: "vector_drag_dot";
    targetDot: number;
    tolerance: number;
  };

  code_input: {
    kind: "code_input";
    language?: string;
    // keep permissive until validator is finalized
    solution?: string;
    tests?: Array<{ stdin?: string; stdout?: string }>;
  };

  text_input: {
    kind: "text_input";
    // what to compare against (can be exact or any-of)
    value?: string;
    anyOf?: string[];
    // optional grading behavior knobs
    normalize?: {
      trim?: boolean;
      caseFold?: boolean; // lower-case before compare
      collapseSpaces?: boolean;
      stripPunct?: boolean;
    };
  };

  drag_reorder: {
    kind: "drag_reorder";
    // canonical order of token ids (most robust)
    tokenIds: string[];
  };

  voice_input: {
    kind: "voice_input";
    // canonical target phrase(s)
    targetText?: string;
    anyOf?: string[];
    // optional grading knobs
    locale?: string;
    normalize?: {
      trim?: boolean;
      caseFold?: boolean;
      collapseSpaces?: boolean;
      stripPunct?: boolean;
      // you can extend later with diacritics folding, etc.
    };
    // optionally allow fuzzy matching later
    // maxDistance?: number;
  };

  word_bank_arrange: {
    kind: "word_bank_arrange";
    targetText: string;
    locale?: string;
    // optional: allow multiple valid sentences
    anyOf?: string[];
    normalize?: {
      trim?: boolean;
      caseFold?: boolean;
      collapseSpaces?: boolean;
      stripPunct?: boolean;
    };
  };

  listen_build: {
    kind: "listen_build";
    targetText: string;
    locale?: string;
    anyOf?: string[];
    normalize?: {
      trim?: boolean;
      caseFold?: boolean;
      collapseSpaces?: boolean;
      stripPunct?: boolean;
    };
  };

  fill_blank_choice: {
    kind: "fill_blank_choice";
    // grade by chosen string (simple + stable)
    value: string;
  };
};

export type Expected = ExpectedByKind[ExerciseKind];

// Helper: get the matching Exercise union member for a kind
export type ExerciseOf<K extends ExerciseKind> = Extract<Exercise, { kind: K }>;
export type ExpectedOf<K extends ExerciseKind> = ExpectedByKind[K];

// Type-safe output: exercise.kind MUST match expected.kind
export type GenOut<K extends ExerciseKind> = {
  exercise: ExerciseOf<K>;
  expected: ExpectedOf<K>;
  archetype: string;
  meta?: {
    purpose?: PracticePurpose;
  };
};

// Convenience constructor (prevents mismatched kinds)
export function out<K extends ExerciseKind>(
    archetype: string,
    exercise: ExerciseOf<K>,
    expected: ExpectedOf<K>,
): GenOut<K> {
  return { archetype, exercise, expected };
}