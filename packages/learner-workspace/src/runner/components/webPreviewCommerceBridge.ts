/**
 * Provider-neutral commerce RPC used only by the local srcDoc WebPreview.
 *
 * The sandbox never receives ZoeBuild cookies, BuildProject authority,
 * provider routing, credentials, or provider secret references. It can only
 * request the same public catalog/cart/checkout operations exposed by the
 * generated __ZOEBUILD_COMMERCE__ facade. The authenticated parent decides
 * whether to service each request.
 */

export const WEB_PREVIEW_COMMERCE_MESSAGE =
    "zoebuild-web-preview:commerce" as const;

export const WEB_PREVIEW_COMMERCE_METHODS = [
    "products.list",
    "products.get",
    "cart.get",
    "cart.add",
    "cart.update",
    "cart.remove",
    "checkout.begin",
] as const;

export type WebPreviewCommerceMethod =
    (typeof WEB_PREVIEW_COMMERCE_METHODS)[number];

export type WebPreviewCommerceRequest = Readonly<{
    requestId: string;
    method: WebPreviewCommerceMethod;
    input: unknown;
}>;

const METHOD_SET =
    new Set<string>(
        WEB_PREVIEW_COMMERCE_METHODS,
    );

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function boundedJsonValue(
    value: unknown,
) {
    try {
        const encoded =
            JSON.stringify(value);

        if (
            encoded === undefined ||
            encoded.length > 16_384
        ) {
            return false;
        }

        JSON.parse(encoded);
        return true;
    } catch {
        return false;
    }
}

export function readWebPreviewCommerceRequest(
    data: unknown,
    bridgeId: string,
): WebPreviewCommerceRequest | null {
    if (!isRecord(data)) {
        return null;
    }

    if (
        data.type !==
            WEB_PREVIEW_COMMERCE_MESSAGE ||
        data.bridgeId !==
            bridgeId ||
        data.kind !==
            "request"
    ) {
        return null;
    }

    if (
        typeof data.requestId !==
            "string" ||
        !data.requestId ||
        data.requestId.length >
            128
    ) {
        return null;
    }

    if (
        typeof data.method !==
            "string" ||
        !METHOD_SET.has(
            data.method,
        )
    ) {
        return null;
    }

    if (
        !boundedJsonValue(
            data.input,
        )
    ) {
        return null;
    }

    return {
        requestId:
            data.requestId,
        method:
            data.method as
                WebPreviewCommerceMethod,
        input:
            data.input,
    };
}

export function acceptWebPreviewCommerceRequest(
    args: Readonly<{
        eventSource:
            MessageEventSource |
            null;
        activeIframeWindow:
            Window |
            null |
            undefined;
        data:
            unknown;
        bridgeId:
            string;
    }>,
) {
    if (
        !args.activeIframeWindow ||
        args.eventSource !==
            args.activeIframeWindow
    ) {
        return null;
    }

    return readWebPreviewCommerceRequest(
        args.data,
        args.bridgeId,
    );
}

/**
 * Runs inside the opaque sandbox. Keep self-contained because the function is
 * serialized into srcDoc before project scripts execute.
 */
export function installWebPreviewCommerceBridge(
    target: Window,
    bridgeId: string,
) {
    const MESSAGE_TYPE =
        "zoebuild-web-preview:commerce";

    /**
     * Opaque sandboxed srcDoc frames are intentionally denied origin-backed
     * Web Storage. Storefront code may still use localStorage for non-secret,
     * browser-only cart continuity, so Preview supplies a per-frame in-memory
     * Storage-compatible fallback. It disappears on iframe reload and never
     * receives cookies, provider credentials, or persistent browser storage.
     */
    function ensureEphemeralStorage(
        name:
            "localStorage" |
            "sessionStorage",
    ) {
        try {
            const existing =
                target[
                    name
                ];

            if (existing) {
                return;
            }
        } catch {
            // Expected for opaque sandbox frames without allow-same-origin.
        }

        const values =
            new Map<
                string,
                string
            >();

        const storage = {
            get length() {
                return values.size;
            },

            clear() {
                values.clear();
            },

            getItem(
                key:
                    string,
            ) {
                const normalized =
                    String(
                        key,
                    );

                return values.has(
                    normalized,
                )
                    ? values.get(
                          normalized,
                      ) ??
                          null
                    : null;
            },

            key(
                index:
                    number,
            ) {
                const normalized =
                    Number(
                        index,
                    );

                if (
                    !Number.isInteger(
                        normalized,
                    ) ||
                    normalized <
                        0
                ) {
                    return null;
                }

                return (
                    Array.from(
                        values.keys(),
                    )[
                        normalized
                    ] ??
                    null
                );
            },

            removeItem(
                key:
                    string,
            ) {
                values.delete(
                    String(
                        key,
                    ),
                );
            },

            setItem(
                key:
                    string,
                value:
                    string,
            ) {
                values.set(
                    String(
                        key,
                    ),
                    String(
                        value,
                    ),
                );
            },
        };

        try {
            Object.defineProperty(
                target,
                name,
                {
                    configurable:
                        true,
                    enumerable:
                        true,
                    value:
                        storage,
                },
            );
        } catch {
            // Fail closed. Storefront code will surface the browser error.
        }
    }

    ensureEphemeralStorage(
        "localStorage",
    );

    ensureEphemeralStorage(
        "sessionStorage",
    );

    const REQUEST_TIMEOUT_MS =
        30_000;
    const MAX_PENDING =
        100;

    let sequence =
        0;

    let hostReady =
        false;

    let resolveHostReady:
        (() => void) |
        null =
        null;

    const hostReadyPromise =
        new Promise<void>(
            (
                resolve,
            ) => {
                resolveHostReady =
                    resolve;
            },
        );

    const pending =
        new Map<
            string,
            {
                resolve:
                    (value: unknown) =>
                        void;
                reject:
                    (error: Error) =>
                        void;
                timer:
                    ReturnType<
                        typeof setTimeout
                    >;
            }
        >();

    async function request(
        method: string,
        input: unknown,
    ) {
        if (
            !hostReady
        ) {
            await hostReadyPromise;
        }

        if (
            pending.size >=
            MAX_PENDING
        ) {
            throw new Error(
                "Too many pending commerce preview requests.",
            );
        }

        sequence +=
            1;

        const requestId =
            `${Date.now().toString(36)}-${sequence.toString(36)}`;

        return new Promise<unknown>(
            (
                resolve,
                reject,
            ) => {
                const timer =
                    setTimeout(
                        () => {
                            pending.delete(
                                requestId,
                            );

                            reject(
                                new Error(
                                    "Commerce preview request timed out.",
                                ),
                            );
                        },
                        REQUEST_TIMEOUT_MS,
                    );

                pending.set(
                    requestId,
                    {
                        resolve,
                        reject,
                        timer,
                    },
                );

                try {
                    target.parent.postMessage(
                        {
                            type:
                                MESSAGE_TYPE,
                            bridgeId,
                            kind:
                                "request",
                            requestId,
                            method,
                            input:
                                input ??
                                {},
                        },
                        "*",
                    );
                } catch {
                    clearTimeout(
                        timer,
                    );

                    pending.delete(
                        requestId,
                    );

                    reject(
                        new Error(
                            "Commerce preview request could not be sent.",
                        ),
                    );
                }
            },
        );
    }

    target.addEventListener(
        "message",
        (
            event,
        ) => {
            if (
                event.source !==
                target.parent
            ) {
                return;
            }

            const data =
                event.data;

            if (
                !data ||
                typeof data !==
                    "object"
            ) {
                return;
            }

            const response =
                data as
                    Record<
                        string,
                        unknown
                    >;

            if (
                response.type !==
                    MESSAGE_TYPE ||
                response.bridgeId !==
                    bridgeId
            ) {
                return;
            }

            if (
                response.kind ===
                "ready"
            ) {
                if (
                    !hostReady
                ) {
                    hostReady =
                        true;

                    resolveHostReady?.();

                    resolveHostReady =
                        null;
                }

                return;
            }

            if (
                response.kind !==
                    "response" ||
                typeof response.requestId !==
                    "string"
            ) {
                return;
            }

            const entry =
                pending.get(
                    response.requestId,
                );

            if (!entry) {
                return;
            }

            clearTimeout(
                entry.timer,
            );

            pending.delete(
                response.requestId,
            );

            if (
                response.ok ===
                true
            ) {
                entry.resolve(
                    response.value,
                );
                return;
            }

            entry.reject(
                new Error(
                    typeof response.message ===
                        "string" &&
                    response.message
                        ? response.message.slice(
                              0,
                              1_000,
                          )
                        : "Commerce preview request failed.",
                ),
            );
        },
    );

    const binding =
        Object.freeze({
            version:
                1,
            products:
                Object.freeze({
                    list(
                        input:
                            unknown =
                            {},
                    ) {
                        return request(
                            "products.list",
                            input,
                        );
                    },
                    get(
                        input:
                            unknown,
                    ) {
                        return request(
                            "products.get",
                            input,
                        );
                    },
                }),
            cart:
                Object.freeze({
                    get(
                        input:
                            unknown,
                    ) {
                        return request(
                            "cart.get",
                            input,
                        );
                    },
                    add(
                        input:
                            unknown,
                    ) {
                        return request(
                            "cart.add",
                            input,
                        );
                    },
                    update(
                        input:
                            unknown,
                    ) {
                        return request(
                            "cart.update",
                            input,
                        );
                    },
                    remove(
                        input:
                            unknown,
                    ) {
                        return request(
                            "cart.remove",
                            input,
                        );
                    },
                }),
            checkout:
                Object.freeze({
                    begin(
                        input:
                            unknown,
                    ) {
                        return request(
                            "checkout.begin",
                            input,
                        );
                    },
                }),
        });

    Object.defineProperty(
        target,
        "__ZOEBUILD_COMMERCE__",
        {
            configurable:
                false,
            enumerable:
                false,
            writable:
                false,
            value:
                binding,
        },
    );
}

export function buildWebPreviewCommerceBridgeScript(
    bridgeId: string,
) {
    const safeBridgeId =
        JSON.stringify(
            bridgeId,
        ).replace(
            /</g,
            "\\u003c",
        );

    return `<script data-zoebuild-commerce-preview-bridge>\n;(${installWebPreviewCommerceBridge.toString()})(window, ${safeBridgeId});\n</script>`;
}
