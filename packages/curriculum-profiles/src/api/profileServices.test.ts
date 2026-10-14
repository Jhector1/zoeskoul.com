import { describe, expect, it } from "vitest";
import { getProfileServices } from "../profileServicesRegistry.js";
import { apiProfileServices, apiTrustPolicy } from "./profileServices.js";

describe("api profile services", () => {
    it("registers API through the code-family services path", () => {
        const services = getProfileServices("api");

        expect(services).toBe(apiProfileServices);
        expect(services.profileId).toBe("api");
    });

    it("keeps API authoring fail-closed and non-auto-publishing", () => {
        expect(apiTrustPolicy).toMatchObject({
            profileId: "api",
            autoPublishEnabled: false,
            requiresCritiquePass: true,
            requiresSemanticValidation: true,
            maxHintWarnings: 0,
            maxMediumRepairs: 0,
            allowHighSeverityRepairs: false,
        });

        expect(getProfileServices("api").getTrustPolicy()).toEqual(apiTrustPolicy);
    });
});
