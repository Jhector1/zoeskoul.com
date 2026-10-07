"use client";

import React from "react";
import SharedWordBankArrangeExerciseUI, {
    type WordBankArrangeExercise,
} from "@zoeskoul/learner-workspace/practice/kinds/WordBankArrangeExerciseUI";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useSpeak } from "@zoeskoul/learner-workspace/language/useSpeak";

type Props = {
    exercise: WordBankArrangeExercise;
    value: string;
    onChangeValue: (value: string) => void;
    disabled: boolean;
    checked: boolean;
    ok: boolean | null;
    reviewCorrectValue?: string | null;
};

export default function WordBankArrangeExerciseUI(props: Props) {
    const speech = useSpeak();

    return (
        <SharedWordBankArrangeExerciseUI
            {...props}
            prompt={<ExercisePrompt exercise={props.exercise as any} />}
            speech={speech}
        />
    );
}
