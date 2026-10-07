"use client";

import type { ComponentProps } from "react";
import SharedVoiceInputExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/VoiceInputExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";

type Props = ComponentProps<typeof SharedVoiceInputExerciseUI>;

export default function VoiceInputExerciseUI(props: Props) {
    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedVoiceInputExerciseUI {...props} />
        </ExercisePromptProvider>
    );
}
