import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseRunReq } from "./parseRunReq";

describe("parseRunReq captureWorkspace", () => {
    it("preserves captureWorkspace for single-file runs", () => {
        const req = parseRunReq({
            language: "python",
            code: "print('hello')\n",
            stdin: "",
            captureWorkspace: true,
        });

        expect(req).toEqual(
            expect.objectContaining({
                kind: "code",
                language: "python",
                code: "print('hello')\n",
                captureWorkspace: true,
            }),
        );
    });

    it("preserves captureWorkspace for project runs", () => {
        const req = parseRunReq({
            language: "python",
            code: "print('hello')\n",
            entry: "main.py",
            files: [
                {
                    path: "main.py",
                    content: "print('old')\n",
                },
            ],
            captureWorkspace: true,
        });

        expect(req).toEqual(
            expect.objectContaining({
                kind: "code",
                language: "python",
                code: "print('hello')\n",
                entry: "main.py",
                captureWorkspace: true,
            }),
        );

        expect("files" in req ? req.files : null).toEqual([
            {
                path: "main.py",
                content: "print('old')\n",
            },
        ]);
    });

    it("defaults captureWorkspace to undefined when not requested", () => {
        const req = parseRunReq({
            language: "python",
            code: "print('hello')\n",
        });

        expect((req as any).captureWorkspace).toBeUndefined();
    });
});