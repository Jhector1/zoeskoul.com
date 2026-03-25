"use client";

import React, { useMemo } from "react";
import type { SavedSketchState } from "../subjects/types";
import type { TemplatePickerSpec } from "../subjects/specTypes";
import { copyText } from "@/components/sketches/_shared/clipboard";
import {
    CodeBlock,
    cn,
    SKETCH_BTN,
    SKETCH_INPUT,
    SKETCH_LABEL,
    SKETCH_SOFT,
} from "@/components/sketches/_shared/sketchUi";

function renderTemplate(tpl: string, vars: Record<string, string>) {
    return tpl.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export default function TemplatePickerSketch({
                                                 spec,
                                                 value,
                                                 onChange,
                                                 readOnly,
                                             }: {
    spec: TemplatePickerSpec;
    value: SavedSketchState;
    onChange: (s: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const data = (value.data ?? {}) as any;
    const templateId = String(data.templateId ?? spec.templates[0]?.id ?? "");
    const vars: Record<string, string> = data.vars ?? {};

    const tpl = useMemo(
        () => spec.templates.find((t) => t.id === templateId) ?? spec.templates[0],
        [spec.templates, templateId],
    );

    const output = useMemo(() => renderTemplate(tpl?.template ?? "", vars), [tpl, vars]);

    function setTemplate(nextId: string) {
        if (readOnly) return;
        onChange({ ...value, updatedAt: new Date().toISOString(), data: { ...data, templateId: nextId } });
    }

    function setVar(k: string, v: string) {
        if (readOnly) return;
        onChange({
            ...value,
            updatedAt: new Date().toISOString(),
            data: { ...data, vars: { ...vars, [k]: v } },
        });
    }

    return (
        <div className="grid gap-3">
            <div className={SKETCH_SOFT}>
                <div className={SKETCH_LABEL}>Choose a template</div>
                <select
                    className={cn(SKETCH_INPUT, "font-extrabold")}
                    value={templateId}
                    onChange={(e) => setTemplate(e.target.value)}
                    disabled={readOnly}
                >
                    {spec.templates.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.label}
                        </option>
                    ))}
                </select>
                {tpl?.description ? (
                    <div className="mt-2 text-xs text-neutral-600 dark:text-white/60">{tpl.description}</div>
                ) : null}
            </div>

            <div className="grid gap-2">
                {tpl?.variables?.map((v) => (
                    <div key={v.key} className={SKETCH_SOFT}>
                        <div className={SKETCH_LABEL}>{v.label}</div>
                        <input
                            className={SKETCH_INPUT}
                            placeholder={v.placeholder}
                            value={vars[v.key] ?? ""}
                            onChange={(e) => setVar(v.key, e.target.value)}
                            disabled={readOnly}
                        />
                    </div>
                ))}
            </div>

            <CodeBlock
                title={spec.outputTitle ?? "Generated prompt"}
                actions={
                    <button
                        type="button"
                        className={SKETCH_BTN}
                        onClick={() => void copyText(output)}
                    >
                        Copy
                    </button>
                }
            >
                {output}
            </CodeBlock>
        </div>
    );
}
