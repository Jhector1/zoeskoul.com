import type { PublishGateResult } from "@zoeskoul/curriculum-contracts";

export function assertPublishGate(gate: PublishGateResult) {
    if (gate.ok) return;

    const message =
        gate.reasons.length > 0
            ? gate.reasons.map((reason) => `- ${reason}`).join("\n")
            : "Publish gate failed for unknown reasons.";

    throw new Error(
        `Publish gate failed for ${gate.subjectSlug} (${gate.profileId}):\n${message}`,
    );
}