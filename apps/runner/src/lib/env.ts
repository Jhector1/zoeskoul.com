export const env = {
    port: Number(process.env.PORT || 4001),
    runnerImage: process.env.RUNNER_IMAGE || "zoeskoul-runtime:latest",
    dockerSocket: process.env.DOCKER_SOCKET || "/var/run/docker.sock",
    wallTimeoutMsDefault: Number(process.env.RUN_WALL_TIMEOUT_MS || 15000),
    idleTimeoutMsDefault: Number(process.env.RUN_IDLE_TIMEOUT_MS || 20000),
    appUrl:  process.env.APP_URL
};