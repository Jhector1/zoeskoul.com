import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next-intl/server", () => ({
    getTranslations: vi.fn(async () => {
        const messages = {
            "review.tryIt.prompt":
                "Open `data/roster.csv`, skip the header row, clean the first student record, and print `Ava Smith <ava@example.com>`.",
            "review.tryIt.interpolated": "Hello {name}",
        } as const;

        const translate = ((key: string, values?: Record<string, unknown>) => {
            const message = messages[key as keyof typeof messages];
            if (!message) {
                throw new Error(`Missing key: ${key}`);
            }

            if (!values) {
                return message;
            }

            return message.replace(
                /\{(\w+)\}/g,
                (_, token: string) => String(values[token] ?? ""),
            );
        }) as ((key: string, values?: Record<string, unknown>) => string) & {
            has?: (key: string) => boolean;
            raw?: (key: string) => string;
        };

        translate.has = (key: string) => key in messages;
        translate.raw = (key: string) => messages[key as keyof typeof messages];

        return translate;
    }),
}));

describe("resolveTaggedOnServer", () => {
    it("uses raw translations for literal tagged content", async () => {
        const { resolveTaggedOnServer } = await import("@/i18n/resolveTaggedOnServer");

        const resolved = await resolveTaggedOnServer({
            prompt: "@:review.tryIt.prompt",
        });

        expect(resolved).toEqual({
            prompt:
                "Open `data/roster.csv`, skip the header row, clean the first student record, and print `Ava Smith <ava@example.com>`.",
        });
    });

    it("still interpolates when values are provided", async () => {
        const { resolveTaggedOnServer } = await import("@/i18n/resolveTaggedOnServer");

        const resolved = await resolveTaggedOnServer(
            { greeting: "@:review.tryIt.interpolated" },
            undefined,
            { name: "Ava" },
        );

        expect(resolved).toEqual({ greeting: "Hello Ava" });
    });
});
