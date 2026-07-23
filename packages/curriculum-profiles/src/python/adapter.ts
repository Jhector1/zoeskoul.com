import { createCodeProfileAdapter } from "../shared/createCodeProfileAdapter.js";
import { pythonProfile } from "./profile.js";

export const pythonProfileAdapter = createCodeProfileAdapter(pythonProfile);
