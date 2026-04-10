import { getLocaleFromCookie } from "@/serverUtils";
import { ensureGuestId, getActor } from "@/lib/practice/actor";
import { bodyJsonResponse, bodyJsonWithGuestCookie } from "@/lib/practice/api/shared/http";
import { resolveSubjectFinishState } from "@/lib/review/api/shared/resolveSubjectFinishState";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const currentModuleSlug = (searchParams.get("moduleSlug") ?? "").trim() || null;

    if (!subjectSlug) {
        return bodyJsonResponse({ message: "Missing subjectSlug." }, 400);
    }

    const actor0 = await getActor();
    const { actor, setGuestId } = ensureGuestId(actor0);
    const locale = await getLocaleFromCookie();

    const resolved = await resolveSubjectFinishState({
        subjectSlug,
        actor,
        locale,
        currentModuleSlug,
    });

    if (!resolved.ok) {
        return bodyJsonWithGuestCookie(
            { message: resolved.message },
            resolved.statusCode,
            setGuestId,
        );
    }

    return bodyJsonWithGuestCookie(resolved.state, 200, setGuestId);
}