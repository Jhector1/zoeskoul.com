"use client";

import type { ComponentProps } from "react";
import SharedSingleChoiceExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/SingleChoiceExerciseUI";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useTaggedT } from "@/i18n/tagged";

type SharedProps = ComponentProps<typeof SharedSingleChoiceExerciseUI>;
type Props = Omit<SharedProps, "chooseOneLabel">;

export default function SingleChoiceExerciseUI(props: Props) {
    const ui = useTaggedT("practiceUi.singleChoice");

    return (
        <ExercisePromptProvider renderer={ExercisePrompt}>
            <SharedSingleChoiceExerciseUI
                {...props}
                chooseOneLabel={ui.t("chooseOne", {}, "Choose one")}
            />
        </ExercisePromptProvider>
    );
}
