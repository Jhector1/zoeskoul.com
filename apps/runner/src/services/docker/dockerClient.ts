import Docker from "dockerode";
import { env } from "../../lib/env";

export const docker = new Docker({
    socketPath: env.dockerSocket,
});