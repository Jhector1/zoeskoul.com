import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { zipProject } from "./projectZip";

async function unzipProject(base64Zip: string) {
    const zip = await JSZip.loadAsync(Buffer.from(base64Zip, "base64"));
    const read = async (name: string) => zip.file(name)?.async("string");

    return {
        zip,
        read,
        names: Object.keys(zip.files).sort(),
    };
}

describe("Judge0 project zip workspace capture", () => {
    it("adds the hidden workspace capture script and wraps Python run script", async () => {
        const encoded = await zipProject("python", "main.py", [
            {
                path: "main.py",
                content:
                    'with open("output.txt", "w") as file:\n    file.write("Hello, World!")\n',
            },
        ]);

        const project = await unzipProject(encoded);

        expect(project.names).toContain("main.py");
        expect(project.names).toContain("run");
        expect(project.names).toContain("run.sh");
        expect(project.names).toContain(".zoe_capture_workspace.py");

        const run = await project.read("run");
        const capture = await project.read(".zoe_capture_workspace.py");

        expect(run).toContain("trap");
        expect(run).toContain("__zoe_capture_workspace");
        expect(run).toContain('python3 "$ENTRY"');

        expect(capture).toContain("__ZOE_WORKSPACE_SNAPSHOT_B64__");
        expect(capture).toContain("__END_ZOE_WORKSPACE_SNAPSHOT_B64__");
        expect(capture).toContain("MAX_TEXT_FILE_BYTES");
        expect(capture).toContain("MAX_BINARY_FILE_BYTES");
    });

    it("adds the capture script for JavaScript project runs", async () => {
        const encoded = await zipProject("javascript", "main.js", [
            {
                path: "main.js",
                content:
                    'const fs = require("fs");\nfs.writeFileSync("output.txt", "Hello, World!");\n',
            },
        ]);

        const project = await unzipProject(encoded);
        const run = await project.read("run");

        expect(project.names).toContain(".zoe_capture_workspace.py");
        expect(run).toContain("trap");
        expect(run).toContain("__zoe_capture_workspace");
        expect(run).toContain('node "$ENTRY"');
    });

    it("supports bash project runs", async () => {
        const encoded = await zipProject("bash", "main.sh", [
            {
                path: "main.sh",
                content: 'echo "Hello from Bash!"\n',
            },
        ]);

        const project = await unzipProject(encoded);
        const run = await project.read("run");

        expect(project.names).toContain(".zoe_capture_workspace.py");
        expect(run).toContain("trap");
        expect(run).toContain("__zoe_capture_workspace");
        expect(run).toContain('bash "main.sh"');
    });



    it("preserves binary project bytes and verifies checksums", async () => {
        const data = Buffer.from([0, 1, 2, 3]);
        const encoded = await zipProject("javascript", "main.js", [
            {
                path: "main.js",
                content: "console.log('ok');\n",
            },
            {
                path: "assets/pixel.png",
                encoding: "base64",
                data: data.toString("base64"),
                mimeType: "text/plain",
                sizeBytes: data.byteLength,
                checksum:
                    "sha256:054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8",
            },
        ]);

        const zip = await JSZip.loadAsync(Buffer.from(encoded, "base64"));
        await expect(zip.file("assets/pixel.png")?.async("nodebuffer")).resolves.toEqual(
            data,
        );

        await expect(
            zipProject("javascript", "main.js", [
                { path: "main.js", content: "console.log('ok');\n" },
                {
                    path: "assets/pixel.png",
                    encoding: "base64",
                    data: data.toString("base64"),
                    mimeType: "image/png",
                    sizeBytes: data.byteLength,
                    checksum: `sha256:${"0".repeat(64)}`,
                },
            ]),
        ).rejects.toThrow(/checksum mismatch/i);
    });

    it("requires a unique text entry file", async () => {
        await expect(
            zipProject("javascript", "main.js", [
                { path: "other.js", content: "console.log('other');\n" },
            ]),
        ).rejects.toThrow(/entry file is missing/i);

        await expect(
            zipProject("javascript", "main.js", [
                { path: "main.js", content: "console.log('first');\n" },
                { path: "main.js", content: "console.log('second');\n" },
            ]),
        ).rejects.toThrow(/duplicate project file path/i);
    });

    it("rejects unsafe project paths", async () => {
        await expect(
            zipProject("python", "../main.py", [
                {
                    path: "../main.py",
                    content: "print('bad')\n",
                },
            ]),
        ).rejects.toThrow(/Unsafe path/);

        await expect(
            zipProject("python", "main.py", [
                {
                    path: "/tmp/main.py",
                    content: "print('bad')\n",
                },
            ]),
        ).rejects.toThrow(/Unsafe path/);
    });
});
