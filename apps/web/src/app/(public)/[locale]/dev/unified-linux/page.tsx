import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { actorKeyOf, getActor } from "@/lib/practice/actor";
import { unifiedPilotConfig, pilotActorValid } from "@/lib/learning/server/unifiedLinuxPilotConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Authenticated actual FullIDE entry during the disposable pilot.
 * Normal CodeRunner and graded lesson routes remain unchanged. */
export default async function UnifiedLinuxPilotPage() {
    const config = unifiedPilotConfig();
    if (!config || (await headers()).get("host") !== "localhost:3000") notFound();
    const actor = await getActor();
    if (!actor.userId) return <main className="p-6"><h1>Unified Linux development pilot</h1><p>Sign in with your dedicated local development account, then reload this page.</p><a href="/authenticate">Sign in</a></main>;
    const actorKey = actorKeyOf(actor);
    if (!pilotActorValid(actorKey)) notFound();
    if (!config.actor) return <main className="p-6 space-y-3"><h1>Unified Linux development pilot</h1><p>Use only a dedicated disposable development account. Copy this account key into the local pilot launcher; do not publish it.</p><code className="break-all">{actorKey}</code><p>Reload after the pilot host starts.</p></main>;
    if (config.actor !== actorKey) notFound();
    return <main className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-lg font-semibold">Unified Linux — dedicated development admission</h1>
        <p>The existing Python programming Sandbox now hosts the existing FullIDE. End any legacy lab before continuing. This remains a disposable, offline two-terminal pilot.</p>
        <a className="inline-block rounded border px-3 py-2" href="/en/sandbox/programming/python?unifiedLinux=1">Open existing Python programming Sandbox</a>
    </main>;
}
