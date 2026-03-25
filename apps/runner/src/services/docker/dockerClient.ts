import Docker from "dockerode";
import { env } from "../../lib/env.js";

export const docker = new Docker({
    socketPath: env.dockerSocket,
});