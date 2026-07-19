import SubjectPicker from "@/features/practice/ui/subject-picker/SubjectPicker";
import { getEnrolledVisibleSubjectCardsForActor } from "@/lib/subjects/server/catalogVisibility";
import { ROUTES } from "@/utils";

export default async function PracticePage() {
    const cards = await getEnrolledVisibleSubjectCardsForActor();

    return (
        <SubjectPicker
            initialSubjects={cards}
            pageKicker="My learning"
            pageTitle="My Courses"
            pageSubtitle="Continue the courses you are already enrolled in, and use catalogs to discover new learning paths."
            emptyTitle="No enrolled courses yet"
            emptySubtitle="Browse the catalog to find a course, and enrolling from a catalog will bring it back here automatically."
            browseHref={ROUTES.catalogs}
            browseLabel="Browse catalogs"
            allowEnrollment={false}
        />
    );
}
