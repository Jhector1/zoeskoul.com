import {
    saveCodeProject as saveSharedCodeProject,
    saveCodeProjectInTransaction as saveSharedInTransaction,
} from "@zoeskoul/platform-server/projects/saveCodeProject";
export * from "@zoeskoul/platform-server/projects/saveCodeProject";

// This application owns generic learning workspaces, not ZoeBuild source.
export function saveCodeProject(
    prisma: Parameters<typeof saveSharedCodeProject>[0],
    input: Parameters<typeof saveSharedCodeProject>[1],
) {
    return saveSharedCodeProject(prisma, input, {genericOnly: true});
}
export function saveCodeProjectInTransaction(
    tx: Parameters<typeof saveSharedInTransaction>[0],
    input: Parameters<typeof saveSharedInTransaction>[1],
) {
    return saveSharedInTransaction(tx, input, {genericOnly: true});
}
