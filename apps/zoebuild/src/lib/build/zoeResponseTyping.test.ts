import { describe, expect, it } from "vitest";
import { nextZoeResponseTypingLength } from "./zoeResponseTyping";
import { readFileSync } from "node:fs";

describe("E17G accessible, bounded reply typewriter", () => {
  it("reveals typical replies progressively without removing characters", () => {
    let n = 0; const all: number[] = [];
    while (n < 60) { n = nextZoeResponseTypingLength(n, 60); all.push(n); }
    expect(all[0]).toBe(1); expect(all.at(-1)).toBe(60);
    expect(all.length).toBe(60);
  });
  it("bounds long replies to at most 120 animation frames", () => {
    let n=0, frames=0;
    while(n < 50000 && frames < 200){n=nextZoeResponseTypingLength(n,50000);frames++;}
    expect(n).toBe(50000); expect(frames).toBeLessThanOrEqual(120);
  });
  it("handles tiny or empty messages and rejects invalid counters", () => {
    expect(nextZoeResponseTypingLength(0,0)).toBe(0);
    expect(nextZoeResponseTypingLength(0,1)).toBe(1);
    expect(() => nextZoeResponseTypingLength(-1,100)).toThrow();
  });
  it("keeps source nonstreaming and reduced-motion accessible", () => {
    const p = new URL("../../app/[locale]/projects/[buildProjectId]/ZoeAssistantMessage.tsx", import.meta.url);
    const source = readFileSync(p,"utf8");
    expect(source).toContain('aria-label={typing ? message : undefined}');
    expect(source).toContain('aria-hidden={typing ? true : undefined}');
    expect(source).toContain('prefers-reduced-motion: reduce');
    expect(source).toContain('document.visibilityState');
    expect(source).toContain('window.setInterval');
    expect(source).not.toContain('EventSource');
  });
});
