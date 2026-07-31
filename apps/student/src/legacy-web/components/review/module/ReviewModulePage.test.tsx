import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReviewModulePage from "./ReviewModulePage";

const mocked = vi.hoisted(() => ({
    controller: {
        layout: {
            ariaBusy: false,
            reduceMotion: true,
            showMask: false,
            showSkeleton: false,
            isNavigating: false,
            navigationLabel: "Loading",
            leftCollapsed: true,
            rightCollapsed: false,
            leftW: 280,
            rightW: 420,
        },
        header: {
            locale: "en",
            toolsUiEnabled: true,
            showDesktopLeft: false,
            showDesktopRight: false,
            leftCollapsed: true,
            rightCollapsed: false,
            modulesHref: "/modules",
            onToggleLeftPanel: vi.fn(),
            onToggleRightPanel: vi.fn(),
            resetOptions: [],
            onPrevTopic: vi.fn(),
            onNextTopic: vi.fn(),
            prevTopic: null,
            nextTopic: null,
            unlockAll: false,
            viewIsComplete: false,
            headerGamification: null,
        },
        leftRail: {
            showDesktopLeft: false,
            leftCollapsed: true,
            leftW: 280,
            onResizeStart: vi.fn(),
            padStyle: {},
            sidebarProps: {},
        },
        rightRail: {
            showDesktopRight: false,
            rightCollapsed: false,
            rightW: 420,
            shouldRenderStackedTools: true,
            onResizeStart: vi.fn(),
            toolsPanelProps: {
                onCollapse: vi.fn(),
                rightBodyRef: { current: null },
                codeRunnerRegionH: 480,
                toolHydrated: true,
                toolLang: "python",
                toolCode: "print('hi')",
                toolStdin: "",
                toolWorkspace: null,
                toolSqlDialect: "sqlite",
                subjectSlug: "python",
                moduleId: "module-1",
                locale: "en",
                codeEnabled: true,
                onChangeCode: vi.fn(),
                onChangeStdin: vi.fn(),
            },
        },
        mobileDrawer: {
            open: false,
            reduceMotion: true,
            onClose: vi.fn(),
            padStyle: {},
            sidebarProps: {},
        },
        courseDrawer: {
            open: false,
            reduceMotion: true,
            onClose: vi.fn(),
            modules: [],
            loading: false,
            error: false,
            onSelectModule: vi.fn(),
        },
        resetDialog: {
            open: false,
            kind: "topic",
            busy: false,
            onClose: vi.fn(),
            onConfirm: vi.fn(),
        },
        celebrations: {
            reduceMotion: true,
            courseCelebrateOpen: false,
            setCourseCelebrateOpen: vi.fn(),
            courseCelebrateBurstKey: 0,
            courseCelebrateCopy: null,
            handleOpenCertificate: vi.fn(),
            moduleCelebrateOpen: false,
            setModuleCelebrateOpen: vi.fn(),
            moduleCelebrateCopy: null,
        },
        topicStage: {
            leftCollapsedEff: true,
            onOpenTopics: vi.fn(),
            mainScrollRef: { current: null },
            padStyle: {},
            viewTopic: null,
            viewCards: [],
            viewTid: "topic-1",
            activeCardIndex: 0,
            navModes: { cards: "scroll", quiz: "scroll" },
            reduceMotion: true,
            tp: {},
            progressHydrated: true,
            versionStr: "v1",
            prereqsForAllQuizzes: true,
            sketch: {},
            setProgress: vi.fn(),
            flushNow: vi.fn(),
            onRun: vi.fn(),
            onReveal: vi.fn(),
            onSubmit: vi.fn(),
            scrollToNextActionable: vi.fn(),
            setCardEl: vi.fn(() => vi.fn()),
            viewIsComplete: false,
            continueLabel: "Continue",
            showSubjectFinish: false,
            subjectSlug: "python",
            moduleSlug: "module-1",
            subjectFinish: null,
            onOpenCertificate: vi.fn(),
        },
        moduleNav: {
            show: true,
            locale: "en",
            subjectSlug: "python",
            prevModuleId: null,
            nextModuleId: null,
            nextLocked: false,
            nextBillingHref: null,
            canGoNext: false,
            showCertificateCta: false,
            canGetCertificate: false,
            certificateLabel: "Get certificate",
            certificateHint: null,
        },
        toolsProvider: {
            enabled: true,
            resetKey: "topic-1",
            externalBoundId: null,
            ensureVisible: vi.fn(),
            onBindToToolsPanel: vi.fn(),
            onUnbindFromToolsPanel: vi.fn(),
        },
    },
}));

vi.mock("./hooks/useReviewModuleController", () => ({
    useReviewModuleController: () => mocked.controller,
}));

vi.mock("./components/layout/ReviewModuleLayout", () => ({
    default: (props: any) => (
        <div data-testid="layout">
            <div data-testid="header-slot">{props.header}</div>
            <div data-testid="left-slot">{props.leftRail}</div>
            <div data-testid="body-slot">{props.body}</div>
            <div data-testid="right-slot">{props.rightRail}</div>
            <div data-testid="drawer-slot">{props.mobileDrawer}</div>
            <div data-testid="overlays-slot">{props.overlays}</div>
        </div>
    ),
}));

vi.mock("./components/layout/ReviewModuleHeader", () => ({
    default: () => <div data-testid="review-header" />,
}));

vi.mock("./components/layout/ReviewModuleLeftRail", () => ({
    default: () => <div data-testid="review-left-rail" />,
}));

vi.mock("./components/layout/ReviewModuleRightRail", () => ({
    default: (props: any) =>
        props.showDesktopRight ? <div data-testid="review-right-rail" /> : null,
}));

vi.mock("./components/layout/ReviewModuleMobileDrawer", () => ({
    default: () => <div data-testid="review-mobile-drawer" />,
}));

vi.mock("./components/layout/ReviewCourseModulesDrawer", () => ({
    default: () => <div data-testid="review-course-modules-drawer" />,
}));

vi.mock("./components/layout/ReviewModuleStackedTools", () => ({
    default: (props: any) =>
        !props.showDesktopRight && !props.rightCollapsed && props.shouldRenderStackedTools ? (
            <div data-testid="review-stacked-tools" />
        ) : null,
}));

vi.mock("./components/content/ReviewTopicStage", () => ({
    default: (props: any) => (
        <div data-testid="review-topic-stage">
            {props.mobileToolsPanel}
        </div>
    ),
}));

vi.mock("./components/celebration/CelebrationLayer", () => ({
    default: () => <div data-testid="celebration-layer" />,
}));

vi.mock("./components/overlays/ReviewResetDialog", () => ({
    default: () => <div data-testid="review-reset-dialog" />,
}));

vi.mock("@/components/review/ReviewModuleNavBar", () => ({
    default: (props: any) => (props.show === false ? null : <div data-testid="review-module-nav" />),
}));

vi.mock("./context/ReviewToolsContext", () => ({
    ReviewToolsProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="review-tools-provider">{children}</div>
    ),
}));

describe("ReviewModulePage responsive tools mount", () => {
    it("renders the stacked tools workspace when the desktop right rail is unavailable", () => {
        const html = renderToStaticMarkup(<ReviewModulePage {...({} as any)} />);

        expect(html).toContain('data-testid="review-topic-stage"');
        expect(html).toContain('data-testid="review-stacked-tools"');
        expect(html).not.toContain('data-testid="review-right-rail"');
    });

    it("mounts both the topic drawer and the course modules drawer", () => {
        const html = renderToStaticMarkup(<ReviewModulePage {...({} as any)} />);

        expect(html).toContain('data-testid="review-mobile-drawer"');
        expect(html).toContain('data-testid="review-course-modules-drawer"');
    });

    it("keeps desktop right rail rendering without the stacked mobile tools shell", () => {
        mocked.controller.rightRail.showDesktopRight = true;
        mocked.controller.rightRail.shouldRenderStackedTools = false;

        const html = renderToStaticMarkup(<ReviewModulePage {...({} as any)} />);

        expect(html).toContain('data-testid="review-right-rail"');
        expect(html).not.toContain('data-testid="review-stacked-tools"');

        mocked.controller.rightRail.showDesktopRight = false;
        mocked.controller.rightRail.shouldRenderStackedTools = true;
    });

    it("omits the bottom module nav when the controller hides it", () => {
        mocked.controller.moduleNav.show = false;

        const html = renderToStaticMarkup(<ReviewModulePage {...({} as any)} />);

        expect(html).not.toContain('data-testid="review-module-nav"');

        mocked.controller.moduleNav.show = true;
    });
});
