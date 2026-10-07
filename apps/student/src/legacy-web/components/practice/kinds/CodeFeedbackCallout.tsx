"use client";

import type { ComponentProps } from "react";
import SharedCodeFeedbackCallout from "@zoeskoul/learner-workspace/components/practice/kinds/CodeFeedbackCallout";
import { useTaggedT } from "@student/i18n/tagged";

type SharedProps = ComponentProps<typeof SharedCodeFeedbackCallout>;
type Props = Omit<SharedProps, "resolveText">;

export default function CodeFeedbackCallout(props: Props) {
    const tagged = useTaggedT();

    return (
        <SharedCodeFeedbackCallout
            {...props}
            resolveText={(value) => tagged.resolve(value, value)}
        />
    );
}
