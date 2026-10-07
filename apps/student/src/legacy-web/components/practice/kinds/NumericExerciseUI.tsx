"use client";

import type { ComponentProps } from "react";
import SharedNumericExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/NumericExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedNumericExerciseUI>;

export default function NumericExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedNumericExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
