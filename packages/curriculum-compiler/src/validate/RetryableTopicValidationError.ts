export class RetryableTopicValidationError extends Error {
    readonly retryable = true;
    readonly code: string;
    readonly details?: unknown;

    constructor(args: {
        code: string;
        message: string;
        details?: unknown;
    }) {
        super(args.message);
        this.name = "RetryableTopicValidationError";
        this.code = args.code;
        this.details = args.details;
    }
}

export function isRetryableTopicValidationError(
    error: unknown,
): error is RetryableTopicValidationError {
    return (
        error instanceof RetryableTopicValidationError ||
        (
            typeof error === "object" &&
            error !== null &&
            (error as any).retryable === true
        )
    );
}