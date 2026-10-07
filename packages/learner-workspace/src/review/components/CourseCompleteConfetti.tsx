"use client";

import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Piece = {
    id: string;
    left: number;
    size: number;
    delay: number;
    duration: number;
    rotateStart: number;
    rotateEnd: number;
    drift: number;
    color: string;
    shape: "rect" | "circle" | "sliver";
    opacity: number;
};

function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makePieces(count: number, seed = 20260412): Piece[] {
    const rand = mulberry32(seed);

    const colors = [
        "#ff5a36",
        "#ffb300",
        "#22c55e",
        "#00bcd4",
        "#3b82f6",
        "#7c3aed",
        "#ec4899",
        "#84cc16",
        "#8b5e3c",
        "#facc15",
    ] as const;

    const shapes: Piece["shape"][] = ["rect", "circle", "sliver"];

    return Array.from({ length: count }, (_, i) => {
        const shape = shapes[Math.floor(rand() * shapes.length)];

        return {
            id: `confetti-${i}`,
            left: rand() * 100,
            size:
                shape === "circle"
                    ? 8 + rand() * 10
                    : shape === "sliver"
                        ? 8 + rand() * 8
                        : 9 + rand() * 10,
            delay: rand() * 0.55,
            duration: 1.8 + rand() * 1.8,
            rotateStart: rand() * 180,
            rotateEnd: 220 + rand() * 520,
            drift: -18 + rand() * 36,
            color: colors[Math.floor(rand() * colors.length)],
            shape,
            opacity: 0.78 + rand() * 0.22,
        };
    });
}

function PieceShape({ piece }: { piece: Piece }) {
    if (piece.shape === "circle") {
        return (
            <div
                style={{
                    width: piece.size,
                    height: piece.size,
                    background: piece.color,
                    borderRadius: 9999,
                    opacity: piece.opacity,
                }}
            />
        );
    }

    if (piece.shape === "sliver") {
        return (
            <div
                style={{
                    width: Math.max(3, piece.size * 0.24),
                    height: piece.size,
                    background: piece.color,
                    borderRadius: 9999,
                    opacity: piece.opacity,
                }}
            />
        );
    }

    return (
        <div
            style={{
                width: piece.size,
                height: Math.max(5, piece.size * 0.72),
                background: piece.color,
                borderRadius: 2,
                opacity: piece.opacity,
            }}
        />
    );
}

export default function CourseCompleteConfetti({
                                                   open,
                                                   reduceMotion = false,
                                                   burstKey = "default",
                                                   count = 90,
                                               }: {
    open: boolean;
    reduceMotion?: boolean;
    burstKey?: string | number;
    count?: number;
}) {
    const pieces = useMemo(() => makePieces(count, String(burstKey).split("").reduce((a, c) => a + c.charCodeAt(0), 17)), [count, burstKey]);

    if (reduceMotion) return null;

    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    key={`confetti-root-${burstKey}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="pointer-events-none fixed inset-0 z-[95] overflow-hidden"
                    aria-hidden="true"
                >
                    {pieces.map((piece) => (
                        <motion.div
                            key={piece.id}
                            className="absolute top-[-8vh]"
                            style={{ left: `${piece.left}%` }}
                            initial={{
                                y: "-8vh",
                                x: 0,
                                rotate: piece.rotateStart,
                                opacity: 0,
                            }}
                            animate={{
                                y: "110vh",
                                x: piece.drift * 6,
                                rotate: piece.rotateEnd,
                                opacity: [0, 1, 1, 0.96, 0],
                            }}
                            exit={{ opacity: 0 }}
                            transition={{
                                duration: piece.duration,
                                delay: piece.delay,
                                ease: "easeOut",
                            }}
                        >
                            <PieceShape piece={piece} />
                        </motion.div>
                    ))}
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}