import type { ReactNode } from "react";

import type { DepartmentHomeExperienceId } from "@/lib/home/departmentHome";

type DepartmentExperienceSectionProps = {
    experienceIds: readonly DepartmentHomeExperienceId[];
    renderers: Partial<Record<DepartmentHomeExperienceId, ReactNode>>;
};

export default function DepartmentExperienceSection({
    experienceIds,
    renderers,
}: DepartmentExperienceSectionProps) {
    const visible = experienceIds
        .map((id) => ({ id, node: renderers[id] }))
        .filter((entry) => entry.node != null);

    if (visible.length === 0) return null;

    return (
        <section
            data-testid="department-experience-section"
            data-experience-count={visible.length}
            className="grid gap-4"
        >
            {visible.map(({ id, node }) => (
                <div
                    key={id}
                    data-department-experience={id}
                    className="min-w-0"
                >
                    {node}
                </div>
            ))}
        </section>
    );
}
