import { createTerminalProfileAdapter } from "../terminal/createTerminalProfileAdapter.js";
import { bashProfile } from "./profile.js";

export const bashProfileAdapter = createTerminalProfileAdapter(bashProfile);
