import React from "react";

export function IconChevronRight(props: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" className={props.className} fill="none">
            <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
export function IconChevronDown(props: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" className={props.className} fill="none">
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
export function IconFolder(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none">
            <path
                d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-11Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
        </svg>
    );
}
export function IconFile(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none">
            <path
                d="M7 3.5h7l3 3V20.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <path d="M14 3.5v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
    );
}
export function IconPlus(props: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" className={props.className} fill="none">
            <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}
export function IconTrash(props: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" className={props.className} fill="none">
            <path d="M6 6h8l-.6 11H6.6L6 6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h.4A1.8 1.8 0 0 1 12 4.8V6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4 6h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}
export function IconPencil(props: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" className={props.className} fill="none">
            <path
                d="M4 13.8V16h2.2l8.4-8.4-2.2-2.2L4 13.8Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <path d="M11.6 5.4l2.2 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}
export function IconPlay(props: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" className={props.className} fill="none">
            <path d="M7 5.5v9l8-4.5-8-4.5Z" fill="currentColor" />
        </svg>
    );
}
export function IconDots(props: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" className={props.className} fill="none">
            <path
                d="M4.5 10a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0Zm4.6 0a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0Zm4.6 0a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0Z"
                fill="currentColor"
            />
        </svg>
    );
}
