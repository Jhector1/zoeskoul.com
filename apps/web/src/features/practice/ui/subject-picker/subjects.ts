export type SubjectCard = {
  slug: string;
  title: string;
  description: string;
  badge?: string;
  emoji?: string;
  comingSoon?: boolean;
};

export const SUBJECTS: SubjectCard[] = [
  { slug: "linear-algebra", title: "Linear Algebra", description: "Vectors, matrices, systems — interactive practice.", badge: "CORE", emoji: "📐" },
  { slug: "python", title: "Python", description: "Syntax, functions, data structures, and real exercises.", badge: "NEW", emoji: "🐍" },
  { slug: "java", title: "Java", description: "OOP, collections, algorithms — build strong fundamentals.", emoji: "☕", comingSoon: true },
  { slug: "ansible", title: "Ansible", description: "Playbooks, inventory, roles — automate infrastructure.", emoji: "🛠️", comingSoon: true },
];
