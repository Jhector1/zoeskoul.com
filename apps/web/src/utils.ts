export const ROUTES = {
    home: "/",
    catalog: "/subjects",

    subjectModules: (subjectSlug: string) => `/subjects/${subjectSlug}/modules`,

    moduleIntro: (subjectSlug: string, moduleSlug: string) =>
        `/subjects/${subjectSlug}/modules/${moduleSlug}`,

    learningPath: (subjectSlug: string, moduleSlug: string) =>
        `/subjects/${subjectSlug}/modules/${moduleSlug}/learn`,

    practicePath: (subjectSlug: string, moduleSlug: string) =>
        `/subjects/${subjectSlug}/modules/${moduleSlug}/practice`,

    review: "/review",
    signIn: "/auth/signin",
    pricing: "/billing",
    contact: "/contact",
    privacy: "/privacy",
    authenticate: "/authenticate",
    terms: "/terms",
    sandbox:"/sandbox",
    achievements:"/achievements"
};
