import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  getTutoringCreditRefundProvenance,
} from "@/lib/tutoring/tutoringCreditRefundProvenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
) {
  if (
    !isAppOriginAllowed(
      request,
    )
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Forbidden.",
      },
      { status: 403 },
    );
  }

  const access =
    await getCurrentUserAccess();

  if (
    !access.authenticated ||
    !access.user ||
    !access.capabilities
      .accessStudentApp
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  try {
    const provenance =
      await getTutoringCreditRefundProvenance(
        access.user.id,
      );

    return appCorsJson(
      request,
      {
        refundable:
          provenance,
      },
    );
  } catch (error) {
    console.error(
      "[tutoring refundable credits]",
      error,
    );

    return appCorsJson(
      request,
      {
        error:
          "Refundable tutoring credit could not be calculated.",
      },
      { status: 500 },
    );
  }
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(
    request,
  );
}
