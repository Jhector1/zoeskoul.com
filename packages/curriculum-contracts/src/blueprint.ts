import type { LocaleCode } from "./locales.js";

export type CourseProfileId =
  | "sql"
  | "python"
  | "math"
  | "language"
  | "web"
  | "data_science";

export type CourseBlueprint = {
  subjectSlug: string;
  profileId: CourseProfileId;
  sourceLocale: "en";
  targetLocales: LocaleCode[];
  title: string;
  description?: string;
  level: "beginner" | "intermediate" | "advanced";
  audience: string[];
  goals: string[];
  teachingStyle?: {
    tone?: string;
    quizWeight?: number;
    projectWeight?: number;
    codeInputWeight?: number;
  };
  constraints: {
    moduleCount: number;
    topicsPerModuleMin: number;
    topicsPerModuleMax: number;
  };
  seedModules?: string[];
};
