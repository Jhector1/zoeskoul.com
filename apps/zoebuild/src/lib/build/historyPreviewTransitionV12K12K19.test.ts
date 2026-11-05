import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {historyPreviewTransitionCopy} from "./historyPreviewTransitionCopy";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("K19 nonblocking, accessible saved-version switching",()=>{
  it("uses actual restore and runner states, never a wall-clock failure",()=>{
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:null,restoreError:false,previewState:"starting",previewMessage:null}).title)
      .toContain("Opening Version 16");
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:57,restoreError:false,previewState:"starting",previewMessage:"Preparing your website…"}).description)
      .toBe("Preparing your website…");
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:57,restoreError:false,previewState:"ready",previewMessage:null}).title)
      .toContain("Loading Version 16 website");
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:57,restoreError:false,previewState:"error",previewMessage:"Runner unavailable"}).description)
      .toBe("Runner unavailable");
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:57,restoreError:true,previewState:"starting",previewMessage:null}).description)
      .toContain("don't restore it again");
  });
  it("contains transition UI within preview, preserving code and conversation",()=>{
    const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    const component=read("../../app/[locale]/projects/[buildProjectId]/HistoryPreviewTransition.tsx");
    const styles=read("../../app/[locale]/projects/[buildProjectId]/HistoryPreviewTransition.module.css");
    expect(shell).toContain("<HistoryPreviewTransition");
    expect(shell.indexOf("<HistoryPreviewTransition")).toBeGreaterThan(shell.indexOf('className="zb-project-preview-stage"'));
    expect(styles).toContain("position:absolute;inset:0");
    expect(styles).not.toContain("position:fixed");
    expect(component).toContain('aria-live="polite"');
    expect(shell).not.toContain('addMessage(`Version V${fromVersion}');
    expect(shell).toContain('confirmedSourceVersion !== previewSourceVersion');
    expect(shell).toContain('historySwitch?.sourceVersion === null');
    expect(shell).toContain('setHistorySwitch(current => current?.restoreError');
    expect(shell).not.toContain('sourceVersion === null ? 45_000 : 145_000');
    expect(shell).not.toContain('setHistorySwitch(current => current?.slow');
    expect(component).toContain('const actionableFailure = props.restoreError ||');
    expect(component).toContain('props.previewState === "error"');
  });
  it("acknowledges a successful server restore before slow authoritative rehydration",()=>{
    const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    const start=shell.indexOf("onRestored={async (savedVersion, fromVersion) => {");
    const end=shell.indexOf("              }}",start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const restore=shell.slice(start,end);
    const acknowledgement=restore.indexOf("setHistorySwitch(current => current?.target === fromVersion");
    const rehydration=restore.indexOf("await refreshAfterSuccessfulApply(savedVersion, undefined, {");
    expect(restore).toContain("deferChatForHistoryRestore: true");
    expect(acknowledgement).toBeGreaterThan(-1);
    expect(rehydration).toBeGreaterThan(acknowledgement);
    expect(restore).toContain("sourceVersion:savedVersion,restoreError:false");
    // Marking POST acknowledgement does not make the preview visible: only
    // hydrated source + matching runner source may dismiss the overlay.
    expect(shell).toContain("historySwitchHasSettled({");
    expect(shell).toContain("confirmedSourceVersion !== previewSourceVersion");
  });
  it("uses one in-app, accessible confirmation for switching and deleting",()=>{
    const history=read("../../app/[locale]/projects/[buildProjectId]/ProjectRevisionHistory.tsx");
    expect(history).toContain('className={styles.confirmDialog}');
    expect(history).toContain('aria-labelledby="zoebuild-version-dialog-heading"');
    expect(history).toContain('dialog.showModal()');
    expect(history).toContain('event.preventDefault()');
    expect(history).toContain('requestAction("switch",revision.version)');
    expect(history).toContain('requestAction("delete",revision.version)');
    expect(history).toContain('DELETE V${pendingAction.version}');
    expect(history).not.toContain('window.confirm(');
    expect(history).not.toContain('window.prompt(');
    expect(history).toContain('"BUILD_HISTORY_STALE"');
  });
});
