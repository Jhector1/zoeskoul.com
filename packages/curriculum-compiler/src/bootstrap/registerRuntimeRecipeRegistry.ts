import {
    setRecipeRegistryResolver,
    type RuntimeRecipeRegistry,
} from "@zoeskoul/curriculum-runtime";
import { getProfile } from "@zoeskoul/curriculum-profiles";

let registered = false;

export function registerRuntimeRecipeRegistry() {
    if (registered) return;

    setRecipeRegistryResolver((profileId) => {
        const profile = getProfile(profileId);

        return profile.getRecipeRegistry() as unknown as RuntimeRecipeRegistry;
    });

    registered = true;
}