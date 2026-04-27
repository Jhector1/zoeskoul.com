import { NextResponse } from "next/server";
import {
    getLearnerProgressDetail,
    searchParamsToLearnerProgressDetailQuery,
} from "@/lib/progress/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = {
    params: Promise<{ actorKey: string }>;
};

export async function GET(req: Request, props: RouteProps) {
    const params = await props.params;
    const { searchParams } = new URL(req.url);

    const data = await getLearnerProgressDetail({
        actorKey: decodeURIComponent(params.actorKey),
        query: searchParamsToLearnerProgressDetailQuery(searchParams),
    });

    if (!data) {
        return NextResponse.json(
            { message: "Learner not found." },
            { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
        );
    }

    return NextResponse.json(data, {
        headers: {
            "Cache-Control": "no-store, max-age=0",
        },
    });
}
