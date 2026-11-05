/**
 * Explicit browser document gateway. %5F%5F encodes the two initial
 * underscores; an actual __zoebuild directory would be private in Next.js.
 * Next.js can select this fixed path
 * without relying on optional catch-all dispatch. The canonical capability
 * proxy remains the only implementation of access control, path checks,
 * runner document forwarding, and sandbox navigation injection.
 */
import {
  GET as readCapabilityDocument,
  HEAD as headCapabilityDocument,
} from "../../[...path]/route";

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
