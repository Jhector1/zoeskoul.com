/** Prevent overlapping cloud POST/PATCH calls within one mounted IDE. */
export function createCloudSaveGate() {
    let inFlight = false;
    return {
        begin(): boolean {
            if (inFlight) return false;
            inFlight = true;
            return true;
        },
        end(): void { inFlight = false; },
        get busy(): boolean { return inFlight; },
    };
}
