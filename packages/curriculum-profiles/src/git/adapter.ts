import { createTerminalProfileAdapter } from "../terminal/createTerminalProfileAdapter.js";
import { gitProfile } from "./profile.js";

export const gitProfileAdapter = createTerminalProfileAdapter(gitProfile);
