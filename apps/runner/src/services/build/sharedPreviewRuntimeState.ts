import { PreviewStartCoordinator } from "./reactPreviewResourceAdmission.js";
import { PreviewProjectDrainRegistry } from "./reactPreviewProjectDrainPolicy.js";

/** The one in-process admission queue and project-deletion drain gate used by
 * both the currently active preview and the candidate TanStack runtime. */
export const sharedPreviewStartCoordinator = new PreviewStartCoordinator(8, 75_000);
export const sharedPreviewProjectDrains = new PreviewProjectDrainRegistry();
