import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {
  clampZoeChatWidth,zoeChatWidthLimit,
  ZOE_CHAT_DESKTOP_MIN_WIDTH,ZOE_CHAT_MIN_WIDTH,ZOE_STAGE_MIN_WIDTH,
} from "./projectAssistantResize";

describe("resizable canonical Zoé workspace",()=>{
  it("reaches both edges with a small recoverable strip, not a 760px cap",()=>{
    expect(clampZoeChatWidth(0,1200)).toBe(72);
    expect(clampZoeChatWidth(4000,1200)).toBe(1120);
    expect(clampZoeChatWidth(4000,2000)).toBe(1920);
    expect(zoeChatWidthLimit(1700)).toBe(1620);
    expect(ZOE_CHAT_MIN_WIDTH).toBe(72);
    expect(ZOE_STAGE_MIN_WIDTH).toBe(72);
    expect(ZOE_CHAT_DESKTOP_MIN_WIDTH).toBe(600);
  });
  it("resists invalid saved sizes, small screens and zero widths",()=>{
    expect(clampZoeChatWidth(Number.NaN,1200)).toBe(400);
    expect(clampZoeChatWidth(-1000,1200)).toBe(72);
    expect(clampZoeChatWidth(Number.POSITIVE_INFINITY,1200)).toBe(400);
    expect(clampZoeChatWidth(500,500)).toBe(420);
    expect(clampZoeChatWidth(500,0)).toBe(72);
  });
  it("measures the project frame and keeps existing FullIDE intact",()=>{
    const shell=readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",import.meta.url),"utf8");
    const css=readFileSync(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShellResize.module.css",import.meta.url),"utf8");
    expect(shell).toContain('ref={chatFrameRef}');
    expect(shell).toContain('ResizeObserver(applyFrameSize)');
    expect(shell).toContain('measuredFrameWidth()');
    expect(shell).toContain('role="separator"');
    expect(shell).toContain('aria-orientation="vertical"');
    expect(shell).toContain('onPointerMove={event =>');
    expect(shell).toContain('onKeyDown={event =>');
    expect(shell).toContain('localStorage.setItem(chatStorageKey');
    expect(shell).toContain('minWidth: 0');
    expect(shell).toContain('gridTemplateColumns:');
    expect(css).toContain('touch-action: none;');
    expect(css).toContain('@media (min-width: 600px)');
    expect(shell).toContain('<BuildWorkspaceClient');
    expect(shell).toContain('<ProjectRevisionHistory');
  });
});
