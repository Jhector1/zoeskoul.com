import { NextResponse } from "next/server";
import {
    getQuestionAnalytics,
    searchParamsToQuestionAnalyticsQuery,
} from "@/lib/progress/questionAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const query = searchParamsToQuestionAnalyticsQuery(searchParams);
    const data = await getQuestionAnalytics(query);

    return NextResponse.json(data, {
        headers: {
            "Cache-Control": "no-store, max-age=0",
        },
    });
}