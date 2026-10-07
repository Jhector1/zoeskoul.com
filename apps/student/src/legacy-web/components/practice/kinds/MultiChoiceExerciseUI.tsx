"use client";

import type { ComponentProps } from "react";
import SharedMultiChoiceExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/MultiChoiceExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedMultiChoiceExerciseUI>;

export default function MultiChoiceExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedMultiChoiceExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
