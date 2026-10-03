"use client";

import React from "react";

export type ResizeSeparatorOrientation = "horizontal" | "vertical";

export type ResizeSeparatorProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur"
> & {
  orientation: ResizeSeparatorOrientation;
  disabled?: boolean;
  onPointerEnter?: React.PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
};

const IDLE_BACKGROUND = "rgba(148, 163, 184, 0.10)";
const ACTIVE_BACKGROUND = "rgba(148, 163, 184, 0.30)";

export default function ResizeSeparator({
  orientation,
  disabled = false,
  className,
  style,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: ResizeSeparatorProps) {
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const active = hovered || focused;

  const axisStyle: React.CSSProperties =
    orientation === "horizontal"
      ? {
          width: "100%",
          height: 6,
          cursor: disabled ? "not-allowed" : "row-resize",
        }
      : {
          width: 6,
          height: "100%",
          cursor: disabled ? "not-allowed" : "col-resize",
        };

  return (
    <div
      {...props}
      role="separator"
      aria-orientation={orientation}
      aria-disabled={disabled || undefined}
      className={className}
      onPointerEnter={(event) => {
        setHovered(true);
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        setHovered(false);
        onPointerLeave?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={{
        ...axisStyle,
        flexShrink: 0,
        touchAction: "none",
        userSelect: "none",
        outline: "none",
        boxShadow: "none",
        opacity: disabled ? 0.6 : 1,
        backgroundColor: active ? ACTIVE_BACKGROUND : IDLE_BACKGROUND,
        transition: "background-color 120ms ease",
        ...style,
      }}
    />
  );
}
