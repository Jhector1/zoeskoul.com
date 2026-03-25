// src/components/review/SketchHost.tsx
"use client";

import React from "react";
import SketchBlock from "@/components/sketches/subjects/SketchBlock";
import type { SavedSketchState } from "@/components/sketches/subjects/types";

export default function SketchHost(props: {
  cardId: string;
  title?: string;
  sketchId: string;
  height?: number;
  propsPatch?: Record<string, unknown>;

  initialState?: SavedSketchState | null;
  onStateChange?: (s: SavedSketchState) => void;

  done?: boolean;
  onMarkDone?: () => void;

  prereqsMet?: boolean;
  locked?: boolean;
}) {
  return <SketchBlock {...props} />;
}


