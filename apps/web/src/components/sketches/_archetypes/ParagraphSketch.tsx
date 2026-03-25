import { cn } from "@/lib/cn";
import TextMarkdown from "@/components/markdown/TextMarkdown";
import MathMarkdown from "@/components/markdown/MathMarkdown";

type ParagraphSpec = {
    archetype: "paragraph";
    specVersion: number;
    title?: string;
    bodyMarkdown?: string;
    text?: string;
};

export function ParagraphSketch({ spec }: { spec: ParagraphSpec }) {
    const md = (spec.bodyMarkdown ?? spec.text ?? "").trim();

    return (
        <div className="">
            {spec.title ? (
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                    {spec.title}
                </div>
            ) : null}

            {/*<div className={cn("mt-2 text-sm text-neutral-700 dark:text-white/75")}>*/}
                {md ? <MathMarkdown content={md} /> : <span className="opacity-60">No text.</span>}
            {/*</div>*/}
        </div>
    );
}
