import type { ProfileServices } from "./shared/profileServices.js";
import { sqlProfileServices } from "./sql/profileServices.js";
import { pythonProfileServices } from "./python/profileServices.js";
import { mathProfileServices } from "./math/profileServices.js";

const PROFILE_SERVICES: Record<string, ProfileServices> = {
    sql: sqlProfileServices,
    python: pythonProfileServices,
    math: mathProfileServices,
};

export function getProfileServices(profileId: string): ProfileServices {
    const found = PROFILE_SERVICES[profileId];
    if (!found) {
        throw new Error(`No profile services registered for profileId "${profileId}"`);
    }
    return found;
}
