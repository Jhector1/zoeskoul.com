import CodeRunner from "@/components/code/runner/CodeRunner";
import React, {useEffect, useMemo, useState} from "react";
import {CodeSketchSpec} from "@/components/sketches/subjects/specTypes";
import MathMarkdown from "@/components/markdown/MathMarkdown";
// import {SavedSketchState} from ".";
import {CodeLanguage} from "@/lib/practice/types";
import {SavedSketchState} from "@/components/sketches/subjects";

export function CodeSketch({
                               spec,
                               value,
                               onChange,
                               readOnly,
                           }: {
    spec: CodeSketchSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}){
    const [code, setCode] = useState(spec.starterCode);
    useEffect(() => setCode(spec.starterCode), [spec.starterCode]);
    // alert(spec.language)
    if (!spec.language)
        return <>"Unknown Language</>

    return (
        <div className="mt-4">
            <MathMarkdown content={spec.instructionsMarkdown??""}/>
            <CodeRunner

                title="Run the Python"
                code={code}
                onChangeCode={setCode}
                // stdin=""
                // onChangeStdin={() => {
                // }}
                hintMarkdown={spec.hint}
                fixedLanguage={spec.language}
                disabled={readOnly}
            />
        </div>)
}