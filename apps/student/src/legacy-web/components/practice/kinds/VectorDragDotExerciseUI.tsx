"use client";

import type { ComponentProps } from "react";
import SharedVectorDragDotExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/VectorDragDotExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedVectorDragDotExerciseUI>;

export default function VectorDragDotExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedVectorDragDotExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
