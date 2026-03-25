import type { LoadedValidateInstance } from "../repositories/instance.repo";

export function getExpectedCanon(instance: LoadedValidateInstance) {
    const secret = instance?.secretPayload as any;
    const expected = secret?.expected;
    if (!expected || typeof expected !== "object") return null;
    return expected;
}