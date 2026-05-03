import type { SketchState } from "./reviewRuntimeTypes";

function cloneJson<T>(value: T): T {
  if (typeof (globalThis as any).structuredClone === "function") {
    try {
      return (globalThis as any).structuredClone(value);
    } catch {
      // fall through
    }
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function createEmptySketch(): SketchState {
  return {
    version: 1,
    elements: [],
  };
}

export function resolveSketchState(args: {
  savedSketch?: SketchState | null;
  starterSketch?: SketchState | null;
}): SketchState {
  if (args.savedSketch) return cloneJson(args.savedSketch);
  if (args.starterSketch) return cloneJson(args.starterSketch);
  return createEmptySketch();
}
