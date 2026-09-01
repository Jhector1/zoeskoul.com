export const OTHER_TUTORING_SUBJECT_VALUE =
  "__other_technology_topic__";

export type TutoringSubjectOption = {
  value: string;
  label: string;
  keywords?: string[];
};

export type TutoringSubjectGroup = {
  label: string;
  options: TutoringSubjectOption[];
};

function option(
  label: string,
  keywords: string[] = [],
): TutoringSubjectOption {
  return {
    value: label,
    label,
    keywords,
  };
}

export const TUTORING_SUBJECT_GROUPS: TutoringSubjectGroup[] = [
  {
    label: "Programming languages",
    options: [
      option("Python"),
      option("JavaScript", ["JS"]),
      option("TypeScript", ["TS"]),
      option("Java"),
      option("C"),
      option("C++", ["CPP"]),
      option("C#"),
      option("Go", ["Golang"]),
      option("Rust"),
      option("PHP"),
      option("Ruby"),
      option("Kotlin"),
      option("Swift"),
      option("R"),
      option("MATLAB"),
      option("Bash / Shell"),
      option("PowerShell"),
      option("COBOL"),
      option("Visual Basic", ["VB", "VB.NET"]),
      option("Assembly"),
    ],
  },
  {
    label: "Computer science fundamentals",
    options: [
      option("Data Structures & Algorithms", [
        "DSA",
        "algorithms",
        "data structures",
      ]),
      option("Algorithms"),
      option("Data Structures"),
      option("Object-Oriented Programming", ["OOP"]),
      option("Discrete Mathematics"),
      option("Computer Science Fundamentals"),
      option("Computer Architecture"),
      option("Operating Systems"),
      option("Compilers"),
      option("Coding Interview Preparation", [
        "LeetCode",
        "technical interview",
      ]),
    ],
  },
  {
    label: "Web & app development",
    options: [
      option("Web Development"),
      option("HTML & CSS"),
      option("React"),
      option("Next.js"),
      option("Node.js"),
      option("Express.js"),
      option("Vue.js"),
      option("Angular"),
      option("Svelte"),
      option("Django"),
      option("Flask"),
      option("Laravel"),
      option("ASP.NET"),
      option("REST APIs"),
      option("GraphQL"),
      option("Mobile App Development"),
      option("React Native"),
      option("Flutter"),
      option("WordPress"),
      option("Shopify"),
    ],
  },
  {
    label: "Databases, data & AI",
    options: [
      option("SQL"),
      option("PostgreSQL"),
      option("MySQL"),
      option("Microsoft SQL Server"),
      option("Oracle Database"),
      option("MongoDB"),
      option("Redis"),
      option("Database Design"),
      option("Data Analysis"),
      option("Pandas"),
      option("NumPy"),
      option("Statistics"),
      option("Data Visualization"),
      option("Power BI"),
      option("Tableau"),
      option("Machine Learning"),
      option("Artificial Intelligence", ["AI"]),
      option("Generative AI & LLMs", [
        "ChatGPT",
        "LLM",
      ]),
    ],
  },
  {
    label: "Microsoft Office & productivity",
    options: [
      option("Microsoft Excel", [
        "Excel",
        "spreadsheets",
      ]),
      option("Advanced Excel", [
        "formulas",
        "pivot tables",
        "VLOOKUP",
        "XLOOKUP",
      ]),
      option("Microsoft Word", ["Word"]),
      option("Microsoft PowerPoint", [
        "PowerPoint",
        "PPT",
      ]),
      option("Microsoft Access"),
      option("Microsoft Outlook"),
      option("Microsoft 365", ["Office 365"]),
      option("Google Sheets"),
      option("Google Docs"),
      option("Google Slides"),
      option("QuickBooks"),
    ],
  },
  {
    label: "Cloud, DevOps & systems",
    options: [
      option("AWS", ["Amazon Web Services"]),
      option("Microsoft Azure"),
      option("Google Cloud", ["GCP"]),
      option("Docker"),
      option("Kubernetes", ["K8s"]),
      option("CI/CD"),
      option("Terraform"),
      option("GitHub Actions"),
      option("Linux Administration"),
      option("Windows Administration"),
      option("macOS Support"),
      option("Command Line / Terminal"),
      option("Computer Troubleshooting"),
    ],
  },
  {
    label: "Networking & cybersecurity",
    options: [
      option("Computer Networking"),
      option("CCNA"),
      option("CompTIA A+"),
      option("CompTIA Network+"),
      option("CompTIA Security+"),
      option("Cybersecurity"),
      option("Network Security"),
      option("Web Security"),
      option("Identity & Access Management", ["IAM"]),
      option("Ethical Hacking"),
    ],
  },
  {
    label: "Developer tools & software engineering",
    options: [
      option("Git & GitHub"),
      option("VS Code"),
      option("Debugging"),
      option("Software Testing"),
      option("Unit Testing"),
      option("Software Architecture"),
      option("System Design"),
      option("Design Patterns"),
      option("Clean Code"),
      option("Agile / Scrum"),
      option("Portfolio Review"),
      option("Technical Interview Preparation"),
      option("Code Review"),
    ],
  },
  {
    label: "Design & creative technology",
    options: [
      option("Adobe Photoshop"),
      option("Adobe Illustrator"),
      option("Figma"),
      option("UI / UX Design"),
      option("Web Design"),
    ],
  },
];

export function matchesTutoringSubject(
  option: TutoringSubjectOption,
  query: string,
) {
  const normalized =
    query.trim().toLocaleLowerCase();

  if (!normalized) return true;

  return [
    option.label,
    ...(option.keywords ?? []),
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized);
}

export function isTutoringSubjectSelectionValid(
  value: string,
  customSubject: string,
) {
  if (
    value ===
    OTHER_TUTORING_SUBJECT_VALUE
  ) {
    return customSubject.trim().length >= 2;
  }

  return Boolean(value.trim());
}

export function tutoringSubjectDisplayName(
  value: string,
  customSubject: string,
  courses: Array<{
    slug: string;
    title: string;
  }>,
) {
  if (
    value ===
    OTHER_TUTORING_SUBJECT_VALUE
  ) {
    return (
      customSubject.trim() ||
      "Other technology topic"
    );
  }

  const course = courses.find(
    (item) => item.slug === value,
  );

  if (course) return course.title;

  return value.trim() || "Not selected";
}
