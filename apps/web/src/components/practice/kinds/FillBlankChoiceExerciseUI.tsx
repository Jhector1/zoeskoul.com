"use client";

import type { ComponentProps } from "react";
import SharedFillBlankChoiceExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/FillBlankChoiceExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedFillBlankChoiceExerciseUI>;

export default function FillBlankChoiceExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedFillBlankChoiceExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
