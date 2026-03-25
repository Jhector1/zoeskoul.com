import MathMarkdown from "@/components/markdown/MathMarkdown";
import {normalizeMath} from "@/lib/markdown/normalizeMath";
import React from "react";
import {Exercise} from "@/lib/practice/types";

export function ExercisePrompt({exercise}: any) {
    return <>       {exercise.prompt ? (
        <MathMarkdown
            className="
                text-sm text-neutral-800 dark:text-white/80
                [&_.katex]:text-neutral-900 dark:[&_.katex]:text-white/90
                [&_.katex-display]:overflow-x-auto
                [&_.katex-display]:py-2
              "
            content={normalizeMath(String(exercise.prompt))}
        />
    ) : null}

        {/*{exercise.title ? (*/}
        {/*    <div className="mt-1 text-xs font-black text-neutral-600 dark:text-white/60">*/}
        {/*        {String(exercise.title)}*/}
        {/*    </div>*/}
        {/*) : null}*/}

    </>
}