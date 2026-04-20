import { getRecipeRegistryForProfile } from "@zoeskoul/curriculum-profiles";

export function getRecipeRegistry(profileId: string) {
    return getRecipeRegistryForProfile(profileId);
}