import {
    describe,
    expect,
    it,
} from "vitest";

import {
    acceptWebPreviewCommerceRequest,
    installWebPreviewCommerceBridge,
    readWebPreviewCommerceRequest,
    WEB_PREVIEW_COMMERCE_MESSAGE,
} from "./webPreviewCommerceBridge";

describe(
    "WebPreview commerce RPC isolation",
    () => {
        it(
            "accepts only the active iframe and current bridge id",
            () => {
                const active =
                    {} as Window;
                const data = {
                    type:
                        WEB_PREVIEW_COMMERCE_MESSAGE,
                    bridgeId:
                        "current",
                    kind:
                        "request",
                    requestId:
                        "request-1",
                    method:
                        "products.list",
                    input: {
                        first:
                            12,
                    },
                };

                expect(
                    acceptWebPreviewCommerceRequest({
                        eventSource:
                            active,
                        activeIframeWindow:
                            active,
                        data,
                        bridgeId:
                            "current",
                    }),
                ).toEqual({
                    requestId:
                        "request-1",
                    method:
                        "products.list",
                    input: {
                        first:
                            12,
                    },
                });

                expect(
                    acceptWebPreviewCommerceRequest({
                        eventSource:
                            {} as Window,
                        activeIframeWindow:
                            active,
                        data,
                        bridgeId:
                            "current",
                    }),
                ).toBeNull();

                expect(
                    readWebPreviewCommerceRequest(
                        {
                            ...data,
                            bridgeId:
                                "stale",
                        },
                        "current",
                    ),
                ).toBeNull();
            },
        );

        it(
            "rejects unsupported methods and oversized input",
            () => {
                expect(
                    readWebPreviewCommerceRequest(
                        {
                            type:
                                WEB_PREVIEW_COMMERCE_MESSAGE,
                            bridgeId:
                                "current",
                            kind:
                                "request",
                            requestId:
                                "request-1",
                            method:
                                "payments.configure",
                            input:
                                {},
                        },
                        "current",
                    ),
                ).toBeNull();

                expect(
                    readWebPreviewCommerceRequest(
                        {
                            type:
                                WEB_PREVIEW_COMMERCE_MESSAGE,
                            bridgeId:
                                "current",
                            kind:
                                "request",
                            requestId:
                                "request-2",
                            method:
                                "cart.add",
                            input: {
                                value:
                                    "x".repeat(
                                        20_000,
                                    ),
                            },
                        },
                        "current",
                    ),
                ).toBeNull();
            },
        );

        it(
            "waits for host readiness before sending the first commerce request",
            async () => {
                const listeners =
                    new Map<
                        string,
                        (
                            event:
                                unknown,
                        ) =>
                            void
                    >();

                const posted:
                    unknown[] =
                    [];

                const parent = {
                    postMessage:
                        (
                            message:
                                unknown,
                        ) => {
                            posted.push(
                                message,
                            );
                        },
                };

                const target = {
                    parent,
                    addEventListener:
                        (
                            type:
                                string,
                            listener:
                                (
                                    event:
                                        unknown,
                                ) =>
                                    void,
                        ) => {
                            listeners.set(
                                type,
                                listener,
                            );
                        },
                } as unknown as Window & {
                    __ZOEBUILD_COMMERCE__:
                        {
                            products: {
                                list(
                                    input?:
                                        unknown,
                                ):
                                    Promise<unknown>;
                            };
                        };
                };

                installWebPreviewCommerceBridge(
                    target,
                    "bridge",
                );

                const result =
                    target.__ZOEBUILD_COMMERCE__.products.list({
                        first:
                            2,
                    });

                await Promise.resolve();

                expect(
                    posted,
                ).toHaveLength(
                    0,
                );

                listeners.get(
                    "message",
                )?.({
                    source:
                        parent,
                    data: {
                        type:
                            WEB_PREVIEW_COMMERCE_MESSAGE,
                        bridgeId:
                            "bridge",
                        kind:
                            "ready",
                    },
                });

                await Promise.resolve();

                expect(
                    posted,
                ).toHaveLength(
                    1,
                );

                const request =
                    posted[0] as {
                        requestId:
                            string;
                    };

                listeners.get(
                    "message",
                )?.({
                    source:
                        parent,
                    data: {
                        type:
                            WEB_PREVIEW_COMMERCE_MESSAGE,
                        bridgeId:
                            "bridge",
                        kind:
                            "response",
                        requestId:
                            request.requestId,
                        ok:
                            true,
                        value:
                            [],
                    },
                });

                await expect(
                    result,
                ).resolves.toEqual(
                    [],
                );
            },
        );

        it(
            "provides ephemeral Web Storage when opaque sandbox access throws",
            () => {
                const listeners =
                    new Map<
                        string,
                        (
                            event:
                                unknown,
                        ) =>
                            void
                    >();

                const parent = {
                    postMessage() {
                        // No request is needed for this storage-only assertion.
                    },
                };

                const target:
                    Record<
                        string,
                        unknown
                    > = {
                    parent,

                    addEventListener(
                        type:
                            string,
                        listener:
                            (
                                event:
                                    unknown,
                            ) =>
                                void,
                    ) {
                        listeners.set(
                            type,
                            listener,
                        );
                    },
                };

                Object.defineProperty(
                    target,
                    "localStorage",
                    {
                        configurable:
                            true,
                        get() {
                            throw new Error(
                                "opaque sandbox",
                            );
                        },
                    },
                );

                Object.defineProperty(
                    target,
                    "sessionStorage",
                    {
                        configurable:
                            true,
                        get() {
                            throw new Error(
                                "opaque sandbox",
                            );
                        },
                    },
                );

                installWebPreviewCommerceBridge(
                    target as unknown as Window,
                    "bridge",
                );

                const local =
                    target.localStorage as Storage;

                local.setItem(
                    "cart",
                    "cart-1",
                );

                expect(
                    local.getItem(
                        "cart",
                    ),
                ).toBe(
                    "cart-1",
                );

                expect(
                    local.length,
                ).toBe(
                    1,
                );

                local.removeItem(
                    "cart",
                );

                expect(
                    local.getItem(
                        "cart",
                    ),
                ).toBeNull();

                const session =
                    target.sessionStorage as Storage;

                session.setItem(
                    "temporary",
                    "yes",
                );

                session.clear();

                expect(
                    session.length,
                ).toBe(
                    0,
                );
            },
        );

        it(
            "installs only the provider-neutral public commerce facade",
            async () => {
                const listeners =
                    new Map<
                        string,
                        (
                            event:
                                unknown,
                        ) =>
                            void
                    >();

                const posted:
                    unknown[] =
                    [];

                const parent = {
                    postMessage:
                        (
                            message:
                                unknown,
                        ) => {
                            posted.push(
                                message,
                            );
                        },
                };

                const target = {
                    parent,
                    addEventListener:
                        (
                            type:
                                string,
                            listener:
                                (
                                    event:
                                        unknown,
                                ) =>
                                    void,
                        ) => {
                            listeners.set(
                                type,
                                listener,
                            );
                        },
                } as unknown as Window & {
                    __ZOEBUILD_COMMERCE__:
                        {
                            version:
                                number;
                            products: {
                                list(
                                    input?:
                                        unknown,
                                ):
                                    Promise<unknown>;
                            };
                        };
                };

                installWebPreviewCommerceBridge(
                    target,
                    "bridge",
                );

                listeners.get(
                    "message",
                )?.({
                    source:
                        parent,
                    data: {
                        type:
                            WEB_PREVIEW_COMMERCE_MESSAGE,
                        bridgeId:
                            "bridge",
                        kind:
                            "ready",
                    },
                });

                expect(
                    target.__ZOEBUILD_COMMERCE__.version,
                ).toBe(
                    1,
                );

                const promise =
                    target.__ZOEBUILD_COMMERCE__.products.list({
                        first:
                            2,
                    });

                expect(
                    posted,
                ).toHaveLength(
                    1,
                );

                const request =
                    posted[0] as {
                        requestId:
                            string;
                    };

                listeners.get(
                    "message",
                )?.({
                    source:
                        parent,
                    data: {
                        type:
                            WEB_PREVIEW_COMMERCE_MESSAGE,
                        bridgeId:
                            "bridge",
                        kind:
                            "response",
                        requestId:
                            request.requestId,
                        ok:
                            true,
                        value: [
                            {
                                id:
                                    "product-1",
                            },
                        ],
                    },
                });

                await expect(
                    promise,
                ).resolves.toEqual([
                    {
                        id:
                            "product-1",
                    },
                ]);

                expect(
                    Object.keys(
                        target.__ZOEBUILD_COMMERCE__,
                    ).sort(),
                ).toEqual([
                    "cart",
                    "checkout",
                    "products",
                    "version",
                ]);
            },
        );
    },
);
