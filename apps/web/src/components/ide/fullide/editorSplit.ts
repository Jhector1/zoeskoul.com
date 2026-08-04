import type { EditorSplitPlacement } from "@/components/code/runner/types";

export const EDITOR_SPLIT_DEFAULT_RATIO = 0.5;
export const EDITOR_SPLIT_MIN_RATIO = 0.15;
export const EDITOR_SPLIT_MAX_RATIO = 0.85;
export const EDITOR_SPLIT_KEYBOARD_STEP = 0.05;

export function clampEditorSplitRatio(value: number): number {
    if (!Number.isFinite(value)) return EDITOR_SPLIT_DEFAULT_RATIO;
    return Math.min(
        EDITOR_SPLIT_MAX_RATIO,
        Math.max(EDITOR_SPLIT_MIN_RATIO, value),
    );
}

export function resolveEditorSplitRatioFromClientX(args: {
    clientX: number;
    left: number;
    width: number;
}): number {
    if (!Number.isFinite(args.width) || args.width <= 0) {
        return EDITOR_SPLIT_DEFAULT_RATIO;
    }

    return clampEditorSplitRatio((args.clientX - args.left) / args.width);
}

export function resolveEditorSplitOrder<T>(args: {
    primary: T;
    secondary: T;
    placement: EditorSplitPlacement;
}): [T, T] {
    return args.placement === "left"
        ? [args.secondary, args.primary]
        : [args.primary, args.secondary];
}
