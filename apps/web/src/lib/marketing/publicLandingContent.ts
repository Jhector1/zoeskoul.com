import type { AppLocale } from "@/lib/seo/types";

export type MarketingPageKey = "learn" | "students" | "teachers" | "schools";
export type LearningPathKey =
  | "programming"
  | "python"
  | "sql"
  | "git"
  | "linux"
  | "ai"
  | "cybersecurity"
  | "languages";

export const LEARNING_PATH_KEYS: LearningPathKey[] = [
  "programming",
  "python",
  "sql",
  "git",
  "linux",
  "ai",
  "cybersecurity",
  "languages",
];

type Cta = { label: string; href: string };
type Feature = { title: string; description: string };

export type LandingCopy = {
  eyebrow: string;
  title: string;
  description: string;
  primary: Cta;
  secondary?: Cta;
  features: Feature[];
  highlightsTitle: string;
  highlights: string[];
  finalTitle: string;
  finalDescription: string;
};

type Localized = Record<AppLocale, string>;
const local = (en: string, fr: string, ht: string): Localized => ({ en, fr, ht });
const l = (locale: AppLocale, value: Localized) => value[locale] ?? value.en;

const PAGE_COPY: Record<MarketingPageKey, {
  eyebrow: Localized;
  title: Localized;
  description: Localized;
  primary: { label: Localized; href: string };
  secondary?: { label: Localized; href: string };
  features: Array<{ title: Localized; description: Localized }>;
  highlightsTitle: Localized;
  highlights: Localized[];
  finalTitle: Localized;
  finalDescription: Localized;
}> = {
  learn: {
    eyebrow: local("Hands-on learning", "Apprentissage pratique", "Aprantisaj pratik"),
    title: local("Learn by doing, not just by watching", "Apprenez en pratiquant, pas seulement en regardant", "Aprann pandan w ap fè, pa sèlman pandan w ap gade"),
    description: local(
      "Build practical skills with interactive lessons, real practice, immediate feedback, and structured learning paths across programming, data, AI, cybersecurity, math, and languages.",
      "Développez des compétences concrètes grâce à des leçons interactives, de la pratique, des retours immédiats et des parcours structurés en programmation, données, IA, cybersécurité, mathématiques et langues.",
      "Devlope ladrès pratik ak leson entèaktif, egzèsis reyèl, fidbak rapid ak chemen aprantisaj nan pwogramasyon, done, AI, sibèsekirite, matematik ak lang."
    ),
    primary: { label: local("Explore learning paths", "Explorer les parcours", "Eksplore chemen aprantisaj yo"), href: "/learn/programming" },
    secondary: { label: local("Try the programming sandbox", "Essayer le bac à sable de programmation", "Eseye sandbox pwogramasyon an"), href: "/sandbox/programming" },
    features: [
      { title: local("Practice-first lessons", "Des leçons axées sur la pratique", "Leson ki mete pratik an premye"), description: local("Move from explanation to active practice quickly.", "Passez rapidement de l'explication à la pratique.", "Pase rapidman soti nan eksplikasyon pou rive nan pratik.") },
      { title: local("Immediate feedback", "Retour immédiat", "Fidbak rapid"), description: local("Try, check, improve, and retry while the concept is fresh.", "Essayez, vérifiez, améliorez et recommencez pendant que le concept est encore frais.", "Eseye, verifye, amelyore epi rekòmanse pandan lide a toujou fre.") },
      { title: local("Structured progression", "Progression structurée", "Pwogresyon òganize"), description: local("Follow modules and topics that build skills step by step.", "Suivez des modules et sujets qui développent les compétences étape par étape.", "Swiv modil ak sijè ki bati ladrès etap pa etap.") },
      { title: local("More than programming", "Au-delà de la programmation", "Plis pase pwogramasyon"), description: local("Use the same active-learning model across technical and language subjects.", "Utilisez le même modèle actif pour les matières techniques et les langues.", "Sèvi ak menm modèl aprantisaj aktif la pou matyè teknik ak lang.") },
    ],
    highlightsTitle: local("Built for active learning", "Conçu pour l'apprentissage actif", "Bati pou aprantisaj aktif"),
    highlights: [local("Interactive coding and practice", "Code et pratique interactifs", "Kòd ak pratik entèaktif"), local("Guided modules and topics", "Modules et sujets guidés", "Modil ak sijè gide"), local("Student progress and review", "Progression et révision", "Pwogrè ak revizyon"), local("Teacher and school workflows", "Outils pour enseignants et écoles", "Zouti pou pwofesè ak lekòl")],
    finalTitle: local("Choose a skill and start practicing", "Choisissez une compétence et commencez à pratiquer", "Chwazi yon ladrès epi kòmanse pratike"),
    finalDescription: local("Explore a learning path or try a public programming tool.", "Explorez un parcours ou essayez un outil de programmation public.", "Eksplore yon chemen oswa eseye yon zouti pwogramasyon piblik."),
  },
  students: {
    eyebrow: local("For students", "Pour les étudiants", "Pou elèv"),
    title: local("Turn studying into hands-on practice", "Transformez l'étude en pratique", "Fè etid tounen pratik"),
    description: local("Spend less time only reading or watching and more time solving, writing, practicing, and improving.", "Passez moins de temps à seulement lire ou regarder et plus de temps à résoudre, écrire, pratiquer et progresser.", "Pase mwens tan sèlman ap li oswa gade, epi plis tan ap rezoud, ekri, pratike ak amelyore."),
    primary: { label: local("Start learning", "Commencer à apprendre", "Kòmanse aprann"), href: "/authenticate" },
    secondary: { label: local("Try the sandbox", "Essayer le bac à sable", "Eseye sandbox la"), href: "/sandbox/programming" },
    features: [
      { title: local("Learn at your pace", "Apprenez à votre rythme", "Aprann nan rit ou"), description: local("Work through lessons and practice with a clear curriculum.", "Progressez avec des leçons et de la pratique dans un parcours clair.", "Travay sou leson ak pratik nan yon kourikoulòm klè.") },
      { title: local("Practice the skill", "Pratiquez la compétence", "Pratike ladrès la"), description: local("Write code, solve exercises, review mistakes, and retry.", "Écrivez du code, résolvez des exercices, revoyez vos erreurs et recommencez.", "Ekri kòd, rezoud egzèsis, revize erè epi rekòmanse.") },
      { title: local("See your progress", "Suivez vos progrès", "Wè pwogrè ou"), description: local("Know what you completed and what comes next.", "Voyez ce que vous avez terminé et la prochaine étape.", "Konnen sa ou fini ak sa k ap vini apre.") },
      { title: local("Get support", "Obtenez du soutien", "Jwenn sipò"), description: local("Use guided help and tutoring workflows when you need more support.", "Utilisez l'aide guidée et le tutorat quand vous en avez besoin.", "Sèvi ak èd gide ak tutorat lè ou bezwen plis sipò.") },
    ],
    highlightsTitle: local("A clearer path from beginner to capable", "Un parcours plus clair du débutant à l'autonomie", "Yon chemen pi klè soti debutan rive kapab"),
    highlights: [local("Beginner-friendly progression", "Progression adaptée aux débutants", "Pwogresyon pou debutan"), local("Interactive exercises", "Exercices interactifs", "Egzèsis entèaktif"), local("Practice and review", "Pratique et révision", "Pratik ak revizyon"), local("Optional tutoring support", "Soutien par tutorat", "Sipò tutorat")],
    finalTitle: local("Start with a real exercise", "Commencez avec un vrai exercice", "Kòmanse ak yon egzèsis reyèl"),
    finalDescription: local("Try a public tool first, then create an account when you are ready to keep progress.", "Essayez d'abord un outil public, puis créez un compte pour conserver vos progrès.", "Eseye yon zouti piblik an premye, epi kreye yon kont lè ou pare pou konsève pwogrè ou."),
  },
  teachers: {
    eyebrow: local("For teachers", "Pour les enseignants", "Pou pwofesè"),
    title: local("Teach with interactive practice and visible progress", "Enseignez avec de la pratique interactive et une progression visible", "Anseye ak pratik entèaktif ak pwogrè ki vizib"),
    description: local("Organize learners, assign learning work, invite students, support practice, and follow progress without turning every lesson into manual setup.", "Organisez les apprenants, assignez du travail, invitez les étudiants, soutenez la pratique et suivez les progrès sans tout configurer manuellement.", "Òganize elèv, bay travay, envite elèv, sipòte pratik epi suiv pwogrè san w pa bezwen prepare tout bagay alamen."),
    primary: { label: local("Talk to ZoeSkoul", "Parler à ZoeSkoul", "Pale ak ZoeSkoul"), href: "/contact" },
    secondary: { label: local("Explore learning", "Explorer les parcours", "Eksplore aprantisaj"), href: "/learn" },
    features: [
      { title: local("Learning groups", "Groupes d'apprentissage", "Gwoup aprantisaj"), description: local("Organize students into manageable groups.", "Organisez les étudiants en groupes faciles à gérer.", "Òganize elèv yo nan gwoup ki fasil pou jere.") },
      { title: local("Course assignments", "Cours et devoirs", "Kou ak devwa"), description: local("Assign structured learning work and invite learners.", "Assignez des parcours structurés et invitez les apprenants.", "Bay travay aprantisaj ki òganize epi envite elèv yo.") },
      { title: local("Progress visibility", "Visibilité sur les progrès", "Vizibilite sou pwogrè"), description: local("Review learner activity and completion signals.", "Consultez l'activité et les indicateurs de progression.", "Revize aktivite elèv ak siy pwogrè yo.") },
      { title: local("Tutoring workflows", "Flux de tutorat", "Zouti tutorat"), description: local("Support students through live tutoring and guided sessions.", "Soutenez les étudiants avec du tutorat et des séances guidées.", "Sipòte elèv ak tutorat ak sesyon gide.") },
    ],
    highlightsTitle: local("Built around real teaching workflows", "Conçu autour de vrais besoins pédagogiques", "Bati pou travay reyèl pwofesè yo"),
    highlights: [local("Student invitations", "Invitations d'étudiants", "Envitasyon elèv"), local("Learning groups", "Groupes d'apprentissage", "Gwoup aprantisaj"), local("Course assignments", "Cours et devoirs", "Kou ak devwa"), local("Progress review", "Suivi des progrès", "Revizyon pwogrè")],
    finalTitle: local("Bring interactive practice into your teaching", "Ajoutez la pratique interactive à votre enseignement", "Mete pratik entèaktif nan ansèyman ou"),
    finalDescription: local("Use existing learning content and teacher workflows instead of rebuilding every activity from scratch.", "Utilisez le contenu et les outils existants au lieu de recréer chaque activité.", "Sèvi ak kontni ak zouti ki deja la olye w rekreye chak aktivite."),
  },
  schools: {
    eyebrow: local("For schools", "Pour les écoles", "Pou lekòl"),
    title: local("A hands-on learning platform for classrooms and programs", "Une plateforme d'apprentissage pratique pour les classes et programmes", "Yon platfòm aprantisaj pratik pou klas ak pwogram"),
    description: local("Give teachers structured interactive content while giving students a consistent place to learn, practice, and build skills.", "Donnez aux enseignants du contenu interactif structuré et aux étudiants un espace cohérent pour apprendre et pratiquer.", "Bay pwofesè kontni entèaktif ki òganize epi bay elèv yon sèl kote pou aprann, pratike ak bati ladrès."),
    primary: { label: local("Talk to ZoeSkoul", "Parler à ZoeSkoul", "Pale ak ZoeSkoul"), href: "/contact" },
    secondary: { label: local("Explore learning", "Explorer les parcours", "Eksplore aprantisaj"), href: "/learn" },
    features: [
      { title: local("Schools and staff", "Écoles et équipes", "Lekòl ak ekip"), description: local("Create organization-level teaching workflows and staff access.", "Organisez les flux pédagogiques et l'accès des équipes.", "Òganize travay ansèyman ak aksè ekip la.") },
      { title: local("Courses and groups", "Cours et groupes", "Kou ak gwoup"), description: local("Structure learning around courses, classes, and learner groups.", "Structurez l'apprentissage autour des cours, classes et groupes.", "Òganize aprantisaj selon kou, klas ak gwoup elèv.") },
      { title: local("Assignments and practice", "Devoirs et pratique", "Devwa ak pratik"), description: local("Combine structured curriculum with hands-on work.", "Combinez programme structuré et travail pratique.", "Konbine kourikoulòm òganize ak travay pratik.") },
      { title: local("Progress and reporting", "Progression et rapports", "Pwogrè ak rapò"), description: local("Use learner activity and reporting workflows to support programs.", "Utilisez l'activité et les rapports pour soutenir vos programmes.", "Sèvi ak aktivite ak rapò pou sipòte pwogram yo.") },
    ],
    highlightsTitle: local("A shared learning environment", "Un environnement d'apprentissage commun", "Yon anviwònman aprantisaj pataje"),
    highlights: [local("Teacher workflows", "Outils enseignants", "Zouti pwofesè"), local("Student learning workspace", "Espace étudiant", "Espas aprantisaj elèv"), local("Interactive curriculum", "Programme interactif", "Kourikoulòm entèaktif"), local("Organization reporting", "Rapports d'organisation", "Rapò òganizasyon")],
    finalTitle: local("Use ZoeSkoul across a class or program", "Utilisez ZoeSkoul dans une classe ou un programme", "Sèvi ak ZoeSkoul nan yon klas oswa pwogram"),
    finalDescription: local("Contact ZoeSkoul to discuss the right setup for your teachers and learners.", "Contactez ZoeSkoul pour discuter de la configuration adaptée à vos enseignants et apprenants.", "Kontakte ZoeSkoul pou diskite sou bon konfigirasyon pou pwofesè ak elèv ou yo."),
  },
};

const PATH_COPY: Record<LearningPathKey, { title: Localized; description: Localized; sandboxHref?: string }> = {
  programming: { title: local("Learn programming through practice", "Apprendre la programmation par la pratique", "Aprann pwogramasyon ak pratik"), description: local("Build programming fundamentals by writing code, running it, fixing mistakes, and progressing into real problem solving.", "Développez les bases de la programmation en écrivant du code, en l'exécutant, en corrigeant les erreurs et en résolvant des problèmes.", "Bati baz pwogramasyon pandan w ap ekri kòd, kouri li, korije erè epi rezoud pwoblèm."), sandboxHref: "/sandbox/programming" },
  python: { title: local("Learn Python with hands-on practice", "Apprendre Python avec de la pratique", "Aprann Python ak pratik"), description: local("Practice Python syntax, logic, data, functions, and projects through interactive exercises.", "Pratiquez la syntaxe Python, la logique, les données, les fonctions et les projets avec des exercices interactifs.", "Pratike sentaks Python, lojik, done, fonksyon ak pwojè atravè egzèsis entèaktif."), sandboxHref: "/sandbox/programming/python" },
  sql: { title: local("Learn SQL by writing real queries", "Apprendre SQL avec de vraies requêtes", "Aprann SQL ak vrè query"), description: local("Practice filtering, joins, aggregation, reporting, and data analysis with hands-on SQL work.", "Pratiquez les filtres, jointures, agrégations, rapports et analyses de données avec SQL.", "Pratike filtè, join, agregasyon, rapò ak analiz done ak SQL."), sandboxHref: "/sandbox/programming/sql" },
  git: { title: local("Learn Git and version control", "Apprendre Git et le contrôle de version", "Aprann Git ak kontwòl vèsyon"), description: local("Understand repositories, commits, branches, merges, and practical version-control workflows.", "Comprenez les dépôts, commits, branches, fusions et flux de contrôle de version.", "Konprann repo, commit, branch, merge ak travay ak kontwòl vèsyon.") },
  linux: { title: local("Learn Linux and terminal fundamentals", "Apprendre Linux et les bases du terminal", "Aprann Linux ak baz tèminal la"), description: local("Build confidence with files, directories, commands, permissions, and terminal workflows.", "Maîtrisez fichiers, dossiers, commandes, permissions et flux du terminal.", "Devlope konfyans ak fichye, dosye, kòmand, pèmisyon ak travay nan tèminal.") },
  ai: { title: local("Build practical AI literacy", "Développer une culture pratique de l'IA", "Bati konpreyansyon pratik sou AI"), description: local("Understand AI concepts, responsible use, prompting, limitations, and practical applications.", "Comprenez les concepts de l'IA, l'usage responsable, les prompts, les limites et les applications.", "Konprann prensip AI, bon fason pou itilize li, prompt, limit ak aplikasyon pratik.") },
  cybersecurity: { title: local("Learn cybersecurity foundations", "Apprendre les bases de la cybersécurité", "Aprann baz sibèsekirite"), description: local("Build security awareness and foundational technical skills through structured learning and practice.", "Développez votre compréhension de la sécurité et des compétences techniques fondamentales.", "Bati konsyans sou sekirite ak ladrès teknik debaz ak leson ak pratik.") },
  languages: { title: local("Practice languages with structured learning", "Pratiquer les langues avec un parcours structuré", "Pratike lang ak aprantisaj ki òganize"), description: local("Use structured lessons and repeated practice to build vocabulary, comprehension, and communication skills.", "Utilisez des leçons structurées et la pratique répétée pour développer vocabulaire, compréhension et communication.", "Sèvi ak leson òganize ak pratik repete pou bati vokabilè, konpreyansyon ak kominikasyon.") },
};

export function getMarketingPageCopy(locale: AppLocale, key: MarketingPageKey): LandingCopy {
  const source = PAGE_COPY[key];
  return {
    eyebrow: l(locale, source.eyebrow),
    title: l(locale, source.title),
    description: l(locale, source.description),
    primary: { label: l(locale, source.primary.label), href: source.primary.href },
    secondary: source.secondary ? { label: l(locale, source.secondary.label), href: source.secondary.href } : undefined,
    features: source.features.map((feature) => ({ title: l(locale, feature.title), description: l(locale, feature.description) })),
    highlightsTitle: l(locale, source.highlightsTitle),
    highlights: source.highlights.map((item) => l(locale, item)),
    finalTitle: l(locale, source.finalTitle),
    finalDescription: l(locale, source.finalDescription),
  };
}

export function getLearningPathCopy(locale: AppLocale, key: LearningPathKey): LandingCopy {
  const source = PATH_COPY[key];
  const sandboxLabel = l(locale, local("Try the programming sandbox", "Essayer le bac à sable de programmation", "Eseye sandbox pwogramasyon an"));
  return {
    eyebrow: l(locale, local("Learning path", "Parcours", "Chemen aprantisaj")),
    title: l(locale, source.title),
    description: l(locale, source.description),
    primary: source.sandboxHref
      ? { label: sandboxLabel, href: source.sandboxHref }
      : { label: l(locale, local("Start learning", "Commencer à apprendre", "Kòmanse aprann")), href: "/authenticate" },
    secondary: { label: l(locale, local("Explore all learning paths", "Explorer tous les parcours", "Eksplore tout chemen yo")), href: "/learn" },
    features: [
      { title: l(locale, local("Understand", "Comprendre", "Konprann")), description: l(locale, local("Build the concept with a clear progression and concrete examples.", "Construisez le concept avec une progression claire et des exemples concrets.", "Bati lide a ak yon pwogresyon klè ak egzanp konkrè.")) },
      { title: l(locale, local("Practice", "Pratiquer", "Pratike")), description: l(locale, local("Put the knowledge into action with exercises and interactive tasks.", "Mettez les connaissances en action avec des exercices et des tâches interactives.", "Mete sa ou aprann lan an pratik ak egzèsis ak travay entèaktif.")) },
      { title: l(locale, local("Improve", "Corriger", "Korije")), description: l(locale, local("Use feedback to correct mistakes and strengthen the skill.", "Utilisez le retour pour corriger les erreurs et consolider la compétence.", "Sèvi ak fidbak pou korije erè epi ranfòse ladrès la.")) },
      { title: l(locale, local("Progress", "Progresser", "Pwogrese")), description: l(locale, local("Move into more advanced topics as the foundations become solid.", "Passez à des sujets plus avancés lorsque les bases sont solides.", "Ale nan sijè ki pi avanse lè baz yo solid.")) },
    ],
    highlightsTitle: l(locale, local("What you will build", "Ce que vous allez développer", "Sa w ap devlope")),
    highlights: [l(locale, source.title), l(locale, local("Hands-on practice", "Pratique active", "Pratik aktif")), l(locale, local("Structured progression", "Progression structurée", "Pwogresyon òganize")), l(locale, local("Practical skill building", "Compétences pratiques", "Ladrès pratik"))],
    finalTitle: l(locale, local("Learn it by practicing it", "Apprenez en pratiquant", "Aprann pandan w ap pratike")),
    finalDescription: l(locale, local("Start with an interactive tool or create an account to follow the full learning path.", "Commencez avec un outil interactif ou créez un compte pour suivre le parcours complet.", "Kòmanse ak yon zouti entèaktif oswa kreye yon kont pou swiv tout chemen an.")),
  };
}
