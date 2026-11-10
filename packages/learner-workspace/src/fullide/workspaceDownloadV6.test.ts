import { describe, expect, it } from "vitest";
import { isExportableV6Path, prepareV6FileDownload, prepareV6ZipDownload } from "./workspaceDownloadV6";

const enc = new TextEncoder();

describe("V6 browser download foundation", () => {
    it("rejects private, unsafe and out-of-workspace paths", () => {
        for (const path of ["../outside", "/etc/passwd", "C:/Windows/file", "a\\b.txt", "a/../b", ".zoe-v6-trash/a", "a/.env", "a/.env.local", "a/.npmrc", ".git/config", "a/node_modules/b", "a/.zoe-sync-x", "a//b"]) {
            expect(isExportableV6Path(path)).toBe(false);
        }
        expect(isExportableV6Path("school/notes.txt")).toBe(true);
    });
    it("preserves original single-file bytes and name", () => {
        const original = Uint8Array.from([0,255,1,2,3,4]);
        const result = prepareV6FileDownload({path:"project/a.png",kind:"file",bytes:original});
        expect(result.filename).toBe("a.png");
        expect(result.bytes).toEqual(original);
        original.fill(0);
        expect(result.bytes[1]).toBe(255);
    });
    it("produces non-empty binary ZIP for complete project and folder selections", () => {
        const entries = [
            {path:"assets",kind:"directory" as const},
            {path:"assets/icon.png",kind:"file" as const,bytes:Uint8Array.from([137,80,78,71,0,255])},
            {path:"src",kind:"directory" as const},
            {path:"src/main.py",kind:"file" as const,bytes:enc.encode('print("ok")\n')},
            {path:"empty",kind:"directory" as const},
            {path:".zoe-v6-trash/secret",kind:"file" as const,bytes:enc.encode("blocked")},
        ];
        const project = prepareV6ZipDownload(entries,{projectName:"class-project"});
        expect(project.filename).toBe("class-project.zip");
        expect(project.bytes.length).toBeGreaterThan(100);
        expect(new TextDecoder().decode(project.bytes).includes("secret")).toBe(false);
        const folder = prepareV6ZipDownload(entries,{folderPath:"assets"});
        expect(folder.filename).toBe("assets.zip");
        expect(folder.bytes.length).toBeLessThan(project.bytes.length);
    });
    it("refuses absent bytes, duplicate paths and file/directory collisions", () => {
        expect(()=>prepareV6ZipDownload([{path:"x.txt",kind:"file"}])).toThrow();
        expect(()=>prepareV6ZipDownload([{path:"x",kind:"directory"},{path:"x",kind:"file",bytes:enc.encode("x")}])).toThrow();
        expect(()=>prepareV6ZipDownload([{path:"x",kind:"file",bytes:enc.encode("x")},{path:"x/y",kind:"file",bytes:enc.encode("y")}])).toThrow();
    });
    it("requires an existing folder to export a selected subtree", () => {
        expect(()=>prepareV6ZipDownload([{path:"src/main.py",kind:"file",bytes:enc.encode("hi")}],{folderPath:"src"})).toThrow();
    });
});
