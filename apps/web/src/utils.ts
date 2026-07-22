export const ROUTES = {
    home: "/",
    catalog: "/subjects",
    catalogs: "/catalogs",
    catalogDetail: (catalogSlug: string) => `/catalogs/${catalogSlug}`,

    subjectModules: (subjectSlug: string) => `/subjects/${subjectSlug}/modules`,

    moduleIntro: (subjectSlug: string, moduleSlug: string) =>
        `/subjects/${subjectSlug}/modules/${moduleSlug}`,

    learningPath: (subjectSlug: string, moduleSlug: string) =>
        `/subjects/${subjectSlug}/modules/${moduleSlug}/learn`,

    practicePath: (subjectSlug: string, moduleSlug: string) =>
        `/subjects/${subjectSlug}/modules/${moduleSlug}/practice`,

    review: "/review",
    dailyPractice: "/practice/daily",
    signIn: "/auth/signin",
    pricing: "/billing",
    contact: "/contact",
    privacy: "/privacy",
    authenticate: "/authenticate",
    terms: "/terms",
    sandbox:"/sandbox",
    achievements:"/achievements"
};

export function toWebSocketUrl(input: string) {
    const url = new URL(input, window.location.href);

    if (url.protocol === "http:" || url.protocol === "ws:") {
        url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    } else if (url.protocol === "https:" || url.protocol === "wss:") {
        url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    }
    return url.toString();
}
