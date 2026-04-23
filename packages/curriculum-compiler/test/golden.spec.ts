import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function pathExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

test("golden snapshot harness placeholder", async () => {
    const goldenRoot = path.join(
        "packages",
        "curriculum-compiler",
        "test",
        "golden",
    );

    const exists = await pathExists(goldenRoot);

    assert.equal(
        exists,
        true,
        "Create packages/curriculum-compiler/test/golden/ with snapshot fixtures before enabling blind publish.",
    );
});