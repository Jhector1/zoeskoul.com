"use client";

import type { ComponentProps } from "react";
import SharedDragReorderExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/DragReorderExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedDragReorderExerciseUI>;

export default function DragReorderExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedDragReorderExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
