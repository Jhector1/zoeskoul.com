import type {
    ProfileServices,
    ProfileTrustPolicy,
} from "./profileServices.js";

export type FamilyProfileServices = Pick<
    ProfileServices,
    "repairDraft" | "critiqueDraft" | "validateProfile" | "validateSemantic"
>;

export type ProfileServiceOverrides = Partial<FamilyProfileServices>;

export function createProfileServices(args: {
    profileId: string;
    family: FamilyProfileServices;
    overrides?: ProfileServiceOverrides;
    getTrustPolicy: () => ProfileTrustPolicy;
}): ProfileServices {
    const overrides = args.overrides ?? {};

    return {
        profileId: args.profileId,
        repairDraft: overrides.repairDraft ?? args.family.repairDraft,
        critiqueDraft: overrides.critiqueDraft ?? args.family.critiqueDraft,
        validateProfile: overrides.validateProfile ?? args.family.validateProfile,
        validateSemantic: overrides.validateSemantic ?? args.family.validateSemantic,
        getTrustPolicy: args.getTrustPolicy,
    };
}