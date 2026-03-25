"use client";

import * as React from "react";
import type { Mode } from "@/lib/math/vec3";
import type { VectorPadState } from "@/components/vectorpad/types";
import { angleBetween, dot, projOfAonB, radToDeg, scalarProjOfAonB, mag } from "@/lib/math/vec3";

export type QuestionType = "dot" | "angle" | "scalarProj" | "projX" | "projY" | "projZ";
export type StatusKind = "idle" | "good" | "bad";

export type Question = {
    id: string;
    type: QuestionType;
    prompt: string;
    correct: number;
    unit?: string;
    tolerance: number;
    createdAt: number;
};

export function usePracticeEngine({
                                      mode,
                                      t,
                                      stateRef,
                                  }: {
    mode: Mode;
    t: (key: string, values?: Record<string, any>) => string;
    stateRef: React.MutableRefObject<VectorPadState>;
}) {
    const [qType, setQType] = React.useState<QuestionType>("dot");
    const [answerText, setAnswerText] = React.useState("");
    const [question, setQuestion] = React.useState<Question | null>(null);
    const [status, setStatus] = React.useState<{ kind: StatusKind; msg: string }>({
        kind: "idle",
        msg: t("status.idle"),
    });

    const buildQuestion = React.useCallback(
        (type: QuestionType): Question => {
            const A = stateRef.current.a;
            const B = stateRef.current.b;

            const angDeg = radToDeg(angleBetween(A, B));
            const pr = projOfAonB(A, B);
            const sp = scalarProjOfAonB(A, B);

            let prompt = "";
            let correct = NaN;
            let unit = "";
            let tol = 0.25;

            switch (type) {
                case "dot":
                    prompt = t("questions.dot");
                    correct = dot(A, B);
                    tol = 0.25;
                    break;
                case "angle":
                    prompt = t("questions.angle");
                    correct = angDeg;
                    unit = "°";
                    tol = 1.0;
                    break;
                case "scalarProj":
                    prompt = t("questions.scalarProj");
                    correct = sp;
                    tol = 0.25;
                    break;
                case "projX":
                    prompt = t("questions.projX");
                    correct = pr.x;
                    tol = 0.25;
                    break;
                case "projY":
                    prompt = t("questions.projY");
                    correct = pr.y;
                    tol = 0.25;
                    break;
                case "projZ":
                    prompt = t("questions.projZ");
                    correct = pr.z;
                    tol = 0.25;
                    break;
            }

            return {
                id: `${type}-${Date.now()}`,
                type,
                prompt,
                correct,
                unit,
                tolerance: tol,
                createdAt: Date.now(),
            };
        },
        [stateRef, t]
    );

    const onNewQuestion = React.useCallback(() => {
        const safeType: QuestionType = mode === "2d" && qType === "projZ" ? "projX" : qType;
        const q = buildQuestion(safeType);
        setQuestion(q);
        setAnswerText("");
        setStatus({
            kind: "idle",
            msg: t("status.question", {
                prompt: q.prompt,
                tolerance: String(q.tolerance),
                unit: q.unit ?? "",
            }),
        });
    }, [mode, qType, buildQuestion, t]);

    const parseAnswer = React.useCallback((s: string) => {
        const cleaned = s.replace(/[^\d\-+.eE]/g, "");
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : NaN;
    }, []);

    const onCheck = React.useCallback(() => {
        if (!question) {
            setStatus({ kind: "bad", msg: t("status.noQuestion") });
            return;
        }
        const userVal = parseAnswer(answerText);
        if (!Number.isFinite(userVal)) {
            setStatus({ kind: "bad", msg: t("status.invalidNumber") });
            return;
        }
        const ok = Math.abs(userVal - question.correct) <= question.tolerance;
        setStatus(
            ok
                ? { kind: "good", msg: t("status.correct", { value: String(userVal) }) }
                : { kind: "bad", msg: t("status.incorrect", { value: String(userVal) }) }
        );
    }, [answerText, parseAnswer, question, t]);

    const onReveal = React.useCallback(() => {
        if (!question) {
            setStatus({ kind: "bad", msg: t("status.noReveal") });
            return;
        }
        setStatus({
            kind: "good",
            msg: t("status.answer", { value: question.correct.toFixed(3), unit: question.unit ?? "" }),
        });
    }, [question, t]);

    return {
        qType,
        setQType,
        answerText,
        setAnswerText,
        question,
        status,
        onNewQuestion,
        onCheck,
        onReveal,
    };
}
