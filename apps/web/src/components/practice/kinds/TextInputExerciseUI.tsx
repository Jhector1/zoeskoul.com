"use client";

import type { ComponentProps } from "react";
import SharedTextInputExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/TextInputExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedTextInputExerciseUI>;

export default function TextInputExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedTextInputExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
