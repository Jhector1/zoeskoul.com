import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {isZoeChatNearBottom, resolveZoeChatFollowState} from "./zoeChatAutoFollow";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("E17L.3 chat scroll gestures and continuous typed-follow",()=>{
  it("distinguishes changing content height from a reader scroll",()=>{
    const atBottom={scrollHeight:1000,scrollTop:700,clientHeight:300};
    const grown={scrollHeight:1350,scrollTop:700,clientHeight:300};
    expect(isZoeChatNearBottom(atBottom)).toBe(true);
    expect(isZoeChatNearBottom(grown)).toBe(false);
    // Regression: a code block grows between MutationObserver and rAF.
    expect(resolveZoeChatFollowState(grown,true,null)).toBe(true);
  });
  it("stops on upward reader intent even within the 64px bottom tolerance",()=>{
    const near={scrollHeight:1000,scrollTop:680,clientHeight:300};
    expect(isZoeChatNearBottom(near)).toBe(true);
    expect(resolveZoeChatFollowState(near,true,"up")).toBe(false);
    expect(resolveZoeChatFollowState(near,false,"up")).toBe(false);
  });
  it("only resumes on a downward reader gesture at the bottom",()=>{
    const far={scrollHeight:1300,scrollTop:600,clientHeight:300};
    const near={scrollHeight:1300,scrollTop:975,clientHeight:300};
    expect(resolveZoeChatFollowState(far,false,"down")).toBe(false);
    expect(resolveZoeChatFollowState(near,false,null)).toBe(false);
    expect(resolveZoeChatFollowState(near,false,"down")).toBe(true);
    expect(resolveZoeChatFollowState(far,true,null)).toBe(true);
  });
  it("fails closed on nonsensical viewport data",()=>{
    expect(isZoeChatNearBottom({scrollHeight:NaN,scrollTop:0,clientHeight:200})).toBe(false);
    expect(resolveZoeChatFollowState({scrollHeight:NaN,scrollTop:0,clientHeight:200},false,"down")).toBe(false);
  });
  it("observes typing mutations and keeps the scroll confined to the rail",()=>{
    const shell=read('../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx');
    expect(shell).toContain('resolveZoeChatFollowState({');
    expect(shell).toContain('onWheel={(event) =>');
    expect(shell).toContain('onTouchMove={(event) =>');
    expect(shell).toContain('onPointerMove={(event) =>');
    expect(shell).toContain('onKeyDown={(event) =>');
    expect(shell).toContain('observer.observe(thread, {childList: true, subtree: true, characterData: true})');
    expect(shell).toContain('thread.scrollTop = thread.scrollHeight');
    expect(shell).toMatch(/if\s*\(\s*role\s*===\s*"user"\s*\)\s*\{\s*chatFollowRef\.current\s*=\s*true\s*;\s*chatScrollIntentRef\.current\s*=\s*null\s*;\s*\}/);
    expect(shell).not.toContain('window.scrollTo(');
  });
  it("retains shared Markdown tokens and no duplicate syntax renderer",()=>{
    const css=read('../../app/[locale]/projects/[buildProjectId]/ZoeAssistantMessage.module.css');
    const message=read('../../app/[locale]/projects/[buildProjectId]/ZoeAssistantMessage.tsx');
    for (const token of ['hljs-keyword','hljs-built_in','hljs-string','hljs-number','hljs-title','hljs-comment'])
      expect(css).toContain(`.markdown :global(.zoe-code-frame .${token})`);
    expect(message).toContain('MathMarkdown');
    expect(message).not.toContain('ReactMarkdown');
  });
});
