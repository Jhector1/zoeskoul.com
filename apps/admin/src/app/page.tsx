import { getProgressDashboard } from "@/lib/progress/query";
import { ProgressDashboardView } from "@/components/progress-dashboard/ProgressDashboardView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page(props: PageProps) {
    const rawSearchParams = (await props.searchParams) ?? {};
    const data = await getProgressDashboard(rawSearchParams);

    return <ProgressDashboardView data={data} />;
}