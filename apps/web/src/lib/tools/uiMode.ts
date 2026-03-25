export type ToolsUiMode = "off" | "desktop" | "all";

// Easy switch:
// - OFF: no Tools anywhere
// - DESKTOP: only desktop screens
// - ALL: phone/tablet/desktop
export function getToolsUiMode(): ToolsUiMode {
    const v = (process.env.NEXT_PUBLIC_TOOLS_UI_MODE ?? "desktop").toLowerCase();
    if (v === "off" || v === "desktop" || v === "all") return v as ToolsUiMode;
    return "desktop";
}

export function computeToolsEnabled(args: {
    subjectAllowsTools: boolean;
    isDesktop: boolean;
}) {
    const mode = getToolsUiMode();

    if (!args.subjectAllowsTools) return false;
    if (mode === "off") return false;
    if (mode === "all") return true;
    return args.isDesktop; // "desktop"
}