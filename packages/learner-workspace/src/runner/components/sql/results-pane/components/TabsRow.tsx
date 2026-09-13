import React from "react";
import {
    UI_BTN,
    UI_BTN_ACTIVE,
    UI_BTN_GHOST,
    cn,
} from "../SqlResultsPane.constants";
import type { TabKey } from "../SqlResultsPane.types";

function TabButton(props: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    const { active, onClick, children } = props;

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(UI_BTN, active ? UI_BTN_ACTIVE : UI_BTN_GHOST)}
        >
            {children}
        </button>
    );
}

export function TabsRow(props: {
    tab: TabKey;
    setTab: (tab: TabKey) => void;
    availableTabs?: TabKey[];
}) {
    const { tab, setTab, availableTabs = ["results", "tables"] } = props;

    const hasTab = (key: TabKey) => availableTabs.includes(key);

    return (
        <div className="flex flex-wrap items-center gap-1.5 p-1">
            {hasTab("results") ? (
                <TabButton active={tab === "results"} onClick={() => setTab("results")}>
                    Results
                </TabButton>
            ) : null}
            {hasTab("tables") ? (
                <TabButton active={tab === "tables"} onClick={() => setTab("tables")}>
                    Tables
                </TabButton>
            ) : null}
            {hasTab("erd") ? (
                <TabButton active={tab === "erd"} onClick={() => setTab("erd")}>
                    ERD
                </TabButton>
            ) : null}
            {hasTab("chen") ? (
                <TabButton active={tab === "chen"} onClick={() => setTab("chen")}>
                    Chen
                </TabButton>
            ) : null}
        </div>
    );
}
