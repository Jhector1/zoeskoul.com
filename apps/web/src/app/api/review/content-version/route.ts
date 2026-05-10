import { NextResponse } from "next/server";
import { getReviewContentVersion } from "@/lib/review/contentVersion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
    const url = new URL(req.url);

    const subjectSlug = url.searchParams.get("subjectSlug")?.trim() ?? "";
    const moduleSlug = url.searchParams.get("moduleSlug")?.trim() ?? "";

    if (!subjectSlug || !moduleSlug) {
        return NextResponse.json(
            {
                ok: false,
                error: "Missing subjectSlug or moduleSlug.",
            },
            {
                status: 400,
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            },
        );
    }

    const contentVersion = await getReviewContentVersion({
        subjectSlug,
        moduleSlug,
    });

    if (!contentVersion) {
        return NextResponse.json(
            {
                ok: false,
                error: "Content version not found.",
            },
            {
                status: 404,
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            },
        );
    }

    return NextResponse.json(
        {
            ok: true,
            contentVersion,
        },
        {
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        },
    );
}