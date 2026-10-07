"use client";

import type { ComponentProps } from "react";
import SharedVectorDragTargetExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/VectorDragTargetExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedVectorDragTargetExerciseUI>;

export default function VectorDragTargetExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedVectorDragTargetExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
