"use client";

import type { ComponentProps } from "react";
import SharedListenBuildExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/ListenBuildExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedListenBuildExerciseUI>;

export default function ListenBuildExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedListenBuildExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
