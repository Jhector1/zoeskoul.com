import { describe, expect, it } from "vitest";
import {prepareV6SessionDownload} from "./workspaceDownloadV6Session";
import type {WorkspaceSyncEntry} from "@zoeskoul/code-contracts";

const entries:WorkspaceSyncEntry[] = [
    {kind:"directory",path:"src"},
    {kind:"file",path:"src/main.py",content:"print('ok')\n"},
    {kind:"file",path:"icon.png",encoding:"base64",data:"AAECA/8=",sizeBytes:5,mimeType:"image/png"},
];

describe("V6 authenticated session download conversion",()=>{
    it("preserves text and exact binary bytes",()=>{
        expect(Array.from(prepareV6SessionDownload(entries,{kind:"file",path:"icon.png"}).bytes))
            .toEqual([0,1,2,3,255]);
        expect(new TextDecoder().decode(prepareV6SessionDownload(entries,{kind:"file",path:"src/main.py"}).bytes))
            .toBe("print('ok')\n");
    });
    it("exports folders and complete projects as ZIP",()=>{
        const folder=prepareV6SessionDownload(entries,{kind:"folder",path:"src"});
        expect(folder.filename).toBe("src.zip");
        expect(Array.from(folder.bytes.subarray(0,4))).toEqual([80,75,3,4]);
        const project=prepareV6SessionDownload(entries,{kind:"project",projectName:"My Python Project"});
        expect(project.filename).toBe("My Python Project.zip");
        expect(project.bytes.length).toBeGreaterThan(folder.bytes.length);
    });
    it("excludes private folders even when included in a forged snapshot",()=>{
        const files = [...entries,{kind:"directory",path:".zoe-v6-trash"},
            {kind:"file",path:".zoe-v6-trash/secret.txt",content:"private"}] as WorkspaceSyncEntry[];
        const zip=prepareV6SessionDownload(files,{kind:"project",projectName:"safe"});
        expect(new TextDecoder().decode(zip.bytes).includes("secret.txt")).toBe(false);
    });
    it("rejects malformed, oversized and absent content without a partial export",()=>{
        expect(()=>prepareV6SessionDownload([{kind:"file",path:"notes.txt",encoding:"base64",data:"abc",sizeBytes:2,mimeType:"application/octet-stream"}],{kind:"project",projectName:"x"})).toThrow();
        expect(()=>prepareV6SessionDownload([{kind:"file",path:"notes.txt",content:"ok"}],{kind:"folder",path:"missing"})).toThrow();
        expect(()=>prepareV6SessionDownload(entries,{kind:"file",path:"missing.txt"})).toThrow();
    });
});
