import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  projectStudentPracticeValidation,
} from "@/lib/learning/studentPracticeValidationData";
import { prisma } from "@/lib/prisma";
import {
  buildPracticeValidateContext,
} from "@/lib/practice/api/validate/context";
import {
  handlePracticeValidate,
} from "@/lib/practice/api/validate/handler";
import {
  BodySchema,
} from "@/lib/practice/api/validate/schemas";
import {
  getClientIp,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  enforceTutoringWorkspaceMutationAccess,
} from "@/lib/tutoring/sessionWorkspaceMutationAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readPayload(
  response: Response,
): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function projectedResponse(
  request: Request,
  response: Response,
) {
  const body =
    projectStudentPracticeValidation(
      await readPayload(response),
    );

  const output = appCorsJson(
    request,
    body,
    { status: response.status },
  );

  const requestId =
    response.headers.get(
      "X-Request-Id",
    );
  const retryAfter =
    response.headers.get(
      "Retry-After",
    );

  if (requestId) {
    output.headers.set(
      "X-Request-Id",
      requestId,
    );
  }
  if (retryAfter) {
    output.headers.set(
      "Retry-After",
      retryAfter,
    );
  }

  return output;
}

export async function POST(
  request: Request,
) {
  const requestId =
    crypto.randomUUID();

  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      {
        ok: null,
        message: "Forbidden.",
        code: "FORBIDDEN",
        explanation: null,
        feedback: null,
        finalized: false,
        duplicate: false,
        attempts: null,
        sessionComplete: false,
        requestId,
      },
      { status: 403 },
    );
  }

  const access =
    await getCurrentUserAccess();

  if (
    !access.authenticated ||
    !access.user
  ) {
    return appCorsJson(
      request,
      {
        ok: null,
        message: "Unauthorized.",
        code: "UNAUTHORIZED",
        explanation: null,
        feedback: null,
        finalized: false,
        duplicate: false,
        attempts: null,
        sessionComplete: false,
        requestId,
      },
      { status: 401 },
    );
  }

  if (
    !access.capabilities
      .accessStudentApp
  ) {
    return appCorsJson(
      request,
      {
        ok: null,
        message: "Forbidden.",
        code: "FORBIDDEN",
        explanation: null,
        feedback: null,
        finalized: false,
        duplicate: false,
        attempts: null,
        sessionComplete: false,
        requestId,
      },
      { status: 403 },
    );
  }

  const tutoringError =
    await enforceTutoringWorkspaceMutationAccess(
      request,
    );
  if (tutoringError) {
    return projectedResponse(
      request,
      tutoringError,
    );
  }

  const contentType =
    request.headers.get(
      "content-type",
    ) ?? "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    return appCorsJson(
      request,
      {
        ok: null,
        message:
          "Unsupported content-type.",
        code:
          "UNSUPPORTED_CONTENT_TYPE",
        explanation: null,
        feedback: null,
        finalized: false,
        duplicate: false,
        attempts: null,
        sessionComplete: false,
        requestId,
      },
      { status: 415 },
    );
  }

  try {
    const limited = await rateLimit(
      `student-practice-validate:` +
      `${access.user.id}:` +
      getClientIp(request),
    );

    if (!limited.ok) {
      const response = appCorsJson(
        request,
        {
          ok: null,
          message:
            "Too many requests.",
          code: "RATE_LIMITED",
          explanation: null,
          feedback: null,
          finalized: false,
          duplicate: false,
          attempts: null,
          sessionComplete: false,
          requestId,
        },
        { status: 429 },
      );
      response.headers.set(
        "Retry-After",
        String(
          Math.max(
            1,
            Math.ceil(
              (
                limited.resetMs -
                Date.now()
              ) / 1000,
            ),
          ),
        ),
      );
      return response;
    }
  } catch {
    return appCorsJson(
      request,
      {
        ok: null,
        message:
          "Service unavailable.",
        code:
          "SERVICE_UNAVAILABLE",
        explanation: null,
        feedback: null,
        finalized: false,
        duplicate: false,
        attempts: null,
        sessionComplete: false,
        requestId,
      },
      { status: 503 },
    );
  }

  const parsed = BodySchema.safeParse(
    await readJsonSafe(request),
  );

  if (!parsed.success) {
    return appCorsJson(
      request,
      {
        ok: null,
        message:
          "Invalid request body.",
        code:
          "INVALID_REQUEST_BODY",
        explanation: null,
        feedback: null,
        finalized: false,
        duplicate: false,
        attempts: null,
        sessionComplete: false,
        requestId,
      },
      { status: 400 },
    );
  }

  if (parsed.data.reveal) {
    return appCorsJson(
      request,
      {
        ok: null,
        message:
          "Reveal is not available in this runtime.",
        code:
          "REVEAL_NOT_AVAILABLE",
        explanation: null,
        feedback: null,
        finalized: false,
        duplicate: false,
        attempts: null,
        sessionComplete: false,
        requestId,
      },
      { status: 403 },
    );
  }

  const prepared =
    await buildPracticeValidateContext({
      prisma,
      req: request,
      requestId,
      body: parsed.data,
    });

  if (prepared.kind === "res") {
    return projectedResponse(
      request,
      prepared.res,
    );
  }

  return projectedResponse(
    request,
    await handlePracticeValidate(
      prepared.ctx,
    ),
  );
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(request);
}
