"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import SharedCodeInputExerciseUI from "@zoeskoul/learner-workspace/components/practice/kinds/CodeInputExerciseUI";
import { CodeInputI18nProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/CodeInputI18nBridge";
import { ExercisePromptProvider } from "@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge";
import { ExercisePrompt } from "@/components/practice/kinds/KindHelper";
import { useTaggedT } from "@student/i18n/tagged";

type Props = ComponentProps<typeof SharedCodeInputExerciseUI>;

export default function CodeInputExerciseUI(props: Props) {
    const t = useTranslations("practice.codeInput");
    const ui = useTaggedT("practiceUi.codeInput");
    const tagged = useTaggedT();

    return (
        <CodeInputI18nProvider
            value={{
                t: (key) => t(key),
                uiT: (key, values, fallback) =>
                    ui.t(key, values ?? {}, fallback),
                resolveText: (value) => tagged.resolve(value, value),
            }}
        >
            <ExercisePromptProvider renderer={ExercisePrompt}>
                <SharedCodeInputExerciseUI {...props} />
            </ExercisePromptProvider>
        </CodeInputI18nProvider>
    );
}
