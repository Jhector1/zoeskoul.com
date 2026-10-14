import type { CourseProfileAdapter } from "../types.js";
import { webProfileAdapter } from "../web/index.js";
import { apiProfile } from "./profile.js";

export { apiProfile };

export const apiProfileAdapter = {
    ...webProfileAdapter,
    id: "api",
} satisfies CourseProfileAdapter;
