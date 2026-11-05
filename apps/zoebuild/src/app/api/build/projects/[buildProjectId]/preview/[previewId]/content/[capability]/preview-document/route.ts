/**
 * Explicit browser document gateway using a Next.js-safe static segment.
 * Avoid the private/encoded underscore directory ambiguity.
 * Next.js selects this fixed path
 * without relying on optional catch-all dispatch. The canonical capability
 * proxy remains the only implementation of access control, path checks,
 * runner document forwarding, and sandbox navigation injection.
 */
import {
  GET as readCapabilityDocument,
  HEAD as headCapabilityDocument,
} from "../[...path]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewDocumentContext = {
  params: Promise<{
    buildProjectId: string;
    previewId: string;
    capability: string;
    path?: string[];
  }>;
};

export async function GET(request: Request, context: PreviewDocumentContext) {
  return readCapabilityDocument(request, context);
}

export async function HEAD(request: Request, context: PreviewDocumentContext) {
  return headCapabilityDocument(request, context);
}
