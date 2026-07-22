export async function recordSubjectVisit(subjectSlug: string): Promise<boolean> {
    try {
        const response = await fetch(
            `/api/subjects/${encodeURIComponent(subjectSlug)}/enroll`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                cache: "no-store",
                keepalive: true,
            },
        );

        return response.ok;
    } catch {
        return false;
    }
}
