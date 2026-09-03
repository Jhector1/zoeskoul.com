
export type LearningOrganizationStaffRole = "admin" | "instructor";

export type LearningOrganizationAccessPolicy = {
  canAccessSchool: boolean;
  canManageSchool: boolean;
  canManageStaff: boolean;
  canCreateClasses: boolean;
  canTeach: boolean;
};

export function resolveLearningOrganizationAccessPolicy(args: {
  platformAdmin: boolean;
  owner: boolean;
  membershipRole?: LearningOrganizationStaffRole | null;
}): LearningOrganizationAccessPolicy {
  const organizationAdmin = args.membershipRole === "admin";
  const instructor = args.membershipRole === "instructor";
  const canManageSchool =
    args.platformAdmin || args.owner || organizationAdmin;

  return {
    canAccessSchool: canManageSchool || instructor,
    canManageSchool,
    canManageStaff: canManageSchool,
    canCreateClasses: canManageSchool || instructor,
    canTeach: canManageSchool || instructor,
  };
}
