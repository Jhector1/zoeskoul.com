import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    testIgnore: ["**/manual/**"],
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [["html"], ["github"]] : [["list"], ["html"]],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
        ? undefined
        : {
            command: "pnpm dev",
            url: "http://localhost:3000",
            reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
            timeout: 120_000,
            env: {
                E2E_ALLOW_DEV_ROUTES: "1",
            }
        },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});