import { getQuestionAnalytics } from "@/lib/progress/questionAnalytics";
import { QuestionStruggleReport } from "@/components/progress-dashboard/QuestionStruggleReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuestionsPage(props: PageProps) {
    const rawSearchParams = (await props.searchParams) ?? {};
    const data = await getQuestionAnalytics(rawSearchParams);

    return <QuestionStruggleReport data={data} />;
}