import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { getTutoringCreditBalance } from "@/lib/tutoring/tutoringCommercial";
import { launchTutoringCreditPackagePresentation } from "@/lib/tutoring/tutoringCreditPackages";
import { tutoringPricingPresentation } from "@/lib/tutoring/tutoringPricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
  }

  const access = await getCurrentUserAccess();
  if (
    !access.authenticated ||
    !access.user ||
    !access.capabilities.accessStudentApp
  ) {
    return appCorsJson(
      request,
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const balance = await getTutoringCreditBalance(access.user.id);

  return appCorsJson(request, {
    balance,
    purchasePackages: launchTutoringCreditPackagePresentation(),
    sessionDurations: [30, 60],
    pricing: tutoringPricingPresentation(),
  });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
