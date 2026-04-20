export function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function topicIdFromTitle(prefix: string, title: string): string {
    return `${prefix}.${slugify(title)}`;
}