import { NextResponse } from "next/server";
import {
    getProgressDashboard,
    searchParamsToProgressQuery,
} from "@/lib/progress/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const query = searchParamsToProgressQuery(searchParams);
    const data = await getProgressDashboard(query);

    return NextResponse.json(data, {
        headers: {
            "Cache-Control": "no-store, max-age=0",
        },
    });
}