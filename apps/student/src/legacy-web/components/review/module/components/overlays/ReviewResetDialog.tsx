"use client";

import React from "react";
import ConfirmResetModal from "@/components/practice/ConfirmResetModal";

type Props = {
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    onClose: () => void;
};

export default function ReviewResetDialog({
                                              open,
                                              title,
                                              description,
                                              onConfirm,
                                              onClose,
                                          }: Props) {
    if (!open) return null;

    return (
        <ConfirmResetModal
            open={open}
            title={title}
            description={description}
            confirmText="Reset"
            cancelText="Cancel"
            danger={true}
            onConfirm={onConfirm}
            onClose={onClose}
        />
    );
}