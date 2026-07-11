"use client";

import React from "react";
import {ReviewToolsProvider} from "@/components/review/module/context/ReviewToolsContext";

import type {ReviewModulePageProps} from "./types";
import {useReviewModuleController} from "./hooks/useReviewModuleController";

import ReviewModuleLayout from "./components/layout/ReviewModuleLayout";
import ReviewModuleHeader from "./components/layout/ReviewModuleHeader";
import ReviewModuleLeftRail from "./components/layout/ReviewModuleLeftRail";
import ReviewModuleRightRail from "./components/layout/ReviewModuleRightRail";
import ReviewModuleMobileDrawer from "./components/layout/ReviewModuleMobileDrawer";
import ReviewCourseModulesDrawer from "./components/layout/ReviewCourseModulesDrawer";
import ReviewModuleStackedTools from "./components/layout/ReviewModuleStackedTools";

import ReviewTopicStage from "./components/content/ReviewTopicStage";

import CelebrationLayer from "./components/celebration/CelebrationLayer";

import ReviewResetDialog from "./components/overlays/ReviewResetDialog";
import ReviewModuleNavBar from "@/components/review/ReviewModuleNavBar";

export default function ReviewModulePage(props: ReviewModulePageProps) {
    const vm = useReviewModuleController(props);

    const page = (

        <>

            <ReviewModuleLayout
                ariaBusy={vm.layout.ariaBusy}
                reduceMotion={vm.layout.reduceMotion}
                showMask={vm.layout.showMask}
                showSkeleton={vm.layout.showSkeleton}
                isNavigating={vm.layout.isNavigating}
                navigationLabel={vm.layout.navigationLabel}
                leftCollapsed={vm.layout.leftCollapsed}
                rightCollapsed={vm.layout.rightCollapsed}
                leftW={vm.layout.leftW}
                rightW={vm.layout.rightW}
                header={<ReviewModuleHeader {...vm.header} />}
                leftRail={<ReviewModuleLeftRail {...vm.leftRail} />}
                rightRail={<ReviewModuleRightRail {...vm.rightRail} />}
                mobileDrawer={
                    <>
                        <ReviewModuleMobileDrawer {...vm.mobileDrawer} />
                        <ReviewCourseModulesDrawer {...vm.courseDrawer} />
                    </>
                }
                overlays={
                    <>
                        <ReviewResetDialog {...vm.resetDialog} />
                        <CelebrationLayer {...vm.celebrations} />
                    </>
                }
                body={
                    <ReviewTopicStage
                        {...vm.topicStage}
                        mobileToolsPanel={<ReviewModuleStackedTools {...vm.rightRail} displayMode="tab" />}
                    />
                }

            />
            <ReviewModuleNavBar {...vm.moduleNav} />

            {/*<div className="ui-surface-muted mt-2 h-[440rem] flex-1 min-h-0 overflow-auto  rounded-none"/>*/}
        </>
    );

    return (
        <ReviewToolsProvider
            enabled={vm.toolsProvider.enabled}
            mode="manual"
            resetKey={vm.toolsProvider.resetKey}
            externalBoundId={vm.toolsProvider.externalBoundId}
            ensureVisible={vm.toolsProvider.ensureVisible}
            onBindToToolsPanel={vm.toolsProvider.onBindToToolsPanel}
            onUnbindFromToolsPanel={vm.toolsProvider.onUnbindFromToolsPanel}
        >
            {page}
        </ReviewToolsProvider>
    );
}
