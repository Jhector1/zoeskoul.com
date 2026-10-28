import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {historyPreviewTransitionCopy} from "./historyPreviewTransitionCopy";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("K19 nonblocking, accessible saved-version switching",()=>{
  it("distinguishes source restoration, preview readiness and bounded failure",()=>{
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:null,failed:false,previewState:"starting",previewMessage:null}).title)
      .toContain("Opening Version 16");
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:57,failed:false,previewState:"starting",previewMessage:"Preparing your website…"}).description)
      .toBe("Preparing your website…");
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:57,failed:true,previewState:"starting",previewMessage:null}).description)
      .toContain("selected files are available in Code");
    expect(historyPreviewTransitionCopy({target:16,sourceVersion:null,failed:true,previewState:"starting",previewMessage:null}).description)
      .toContain("selection response was not confirmed");
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
    expect(shell).toContain('setHistorySwitch(current => current?.failed');
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
