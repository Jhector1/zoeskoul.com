import { ROUTES } from "@/utils";

export type ProfileWorkspaceRole = "student" | "teacher" | "admin";

export type ProfileNavigationIcon =
  | "book"
  | "message"
  | "award"
  | "clipboard"
  | "users"
  | "dashboard"
  | "practice"
  | "trophy"
  | "billing";

export type ProfileNavigationItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  icon: ProfileNavigationIcon;
};

export type ProfileNavigationSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  items: ProfileNavigationItem[];
};

const learningItems: ProfileNavigationItem[] = [
  {
    id: "assigned-courses",
    href: ROUTES.assignments,
    title: "Assigned courses",
    description: "Open courses shared directly by an instructor or learning group.",
    icon: "book",
  },
  {
    id: "student-tutoring",
    href: ROUTES.tutoringSessions,
    title: "Tutoring sessions",
    description: "Join live sessions and reopen shared tutoring reviews.",
    icon: "message",
  },
  {
    id: "achievements",
    href: ROUTES.achievements,
    title: "Certificates and achievements",
    description: "Review certificates, milestones, and learning progress.",
    icon: "award",
  },
];

const teacherItems: ProfileNavigationItem[] = [
  {
    id: "course-assignments",
    href: ROUTES.teachingCourseAssignments,
    title: "Course assignments",
    description: "Assign private interactive courses to students and groups.",
    icon: "clipboard",
  },
  {
    id: "student-groups",
    href: ROUTES.teachingLearningGroups,
    title: "Student groups",
    description: "Organize reusable groups and maintain their membership.",
    icon: "users",
  },
  {
    id: "teacher-tutoring",
    href: ROUTES.teachingTutoringSessions,
    title: "Tutoring sessions",
    description: "Create, teach, share, and reopen private tutoring classrooms.",
    icon: "message",
  },
];

const adminItems: ProfileNavigationItem[] = [
  {
    id: "admin-dashboard",
    href: ROUTES.adminDashboard,
    title: "Admin dashboard",
    description: "Review platform activity, delivery totals, and operational shortcuts.",
    icon: "dashboard",
  },
  {
    id: "practice-assignments",
    href: ROUTES.adminAssignments,
    title: "Practice assignments",
    description: "Create and manage the platform practice assignment library.",
    icon: "practice",
  },
  {
    id: "public-challenges",
    href: ROUTES.adminPublicChallenges,
    title: "Public challenges",
    description: "Publish and maintain challenges available across the platform.",
    icon: "trophy",
  },
];

const subscriptionItems: ProfileNavigationItem[] = [
  {
    id: "billing",
    href: ROUTES.pricing,
    title: "Billing and plan",
    description: "Manage your subscription, invoices, and payment method.",
    icon: "billing",
  },
];

export function resolveProfileNavigation(
  role: ProfileWorkspaceRole,
): ProfileNavigationSection[] {
  const sections: ProfileNavigationSection[] = [
    {
      id: "learning",
      eyebrow: role === "student" ? "Student" : "Learning",
      title: role === "student" ? "Student workspace" : "Your learning workspace",
      description:
        role === "student"
          ? "Everything shared with you for learning is kept together here."
          : "Your own assigned courses, tutoring rooms, and achievements remain separate from management tools.",
      items: learningItems,
    },
  ];

  if (role === "teacher") {
    sections.push({
      id: "teaching",
      eyebrow: "Teacher",
      title: "Teaching workspace",
      description: "Manage only the students, groups, assignments, and tutoring sessions you own.",
      items: teacherItems,
    });
  }

  if (role === "admin") {
    sections.push(
      {
        id: "teaching",
        eyebrow: "Admin teaching",
        title: "Teaching operations",
        description: "Manage course delivery, groups, and tutoring sessions across all instructors.",
        items: teacherItems,
      },
      {
        id: "administration",
        eyebrow: "Administrator",
        title: "Platform administration",
        description: "Platform-wide tools are shown only to administrators.",
        items: adminItems,
      },
    );
  }

  if (role === "student") {
    sections.push({
      id: "subscription",
      eyebrow: "Account",
      title: "Subscription",
      description:
        "Billing applies to general catalog access. Courses and tutoring sessions assigned to you remain available without a personal subscription.",
      items: subscriptionItems,
    });
  }

  return sections;
}

export function profileRoleLabel(role: ProfileWorkspaceRole) {
  if (role === "admin") return "Administrator";
  if (role === "teacher") return "Teacher";
  return "Student";
}
