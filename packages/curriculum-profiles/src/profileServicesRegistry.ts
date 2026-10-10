import type { ProfileServices } from "./shared/profileServices.js";
import { bashProfileServices } from "./bash/profileServices.js";
import { gitProfileServices } from "./git/profileServices.js";
import { sqlProfileServices } from "./sql/profileServices.js";
import { pythonProfileServices } from "./python/profileServices.js";
import { cProfileServices } from "./c/profileServices.js";
import { languageProfileServices } from "./language/profileServices.js";
import { webProfileServices } from "./web/profileServices.js";

const PROFILE_SERVICES: Record<string, ProfileServices> = {
    bash: bashProfileServices,
    git: gitProfileServices,
    sql: sqlProfileServices,
    python: pythonProfileServices,
    c: cProfileServices,
    language: languageProfileServices,
    web: webProfileServices,
};

export function getProfileServices(profileId: string): ProfileServices {
    const found = PROFILE_SERVICES[profileId];
    if (!found) {
        throw new Error(`No profile services registered for profileId "${profileId}"`);
    }
    return found;
}
