"use client";

export type ZoeBuildMode = "preview" | "code" | "ai";

const MODES: readonly {
  id: ZoeBuildMode;
  label: string;
}[] = [
  { id: "preview", label: "Preview" },
  { id: "code", label: "Code" },
  { id: "ai", label: "AI" },
];

export function ZoeBuildModeTabs(props: {
  value: ZoeBuildMode;
  onChange: (mode: ZoeBuildMode) => void;
}) {
  return (
    <div
      className="zb-mode-tabs"
      role="tablist"
      aria-label="Builder mode"
    >
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={props.value === mode.id}
          className={
            props.value === mode.id
              ? "zb-mode-tab is-active"
              : "zb-mode-tab"
          }
          onClick={() => props.onChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
