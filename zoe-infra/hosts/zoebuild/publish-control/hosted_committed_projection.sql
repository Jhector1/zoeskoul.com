-- Private read-only grant projection. One MVCC statement. No legacy adoption.
-- Caller supplies a JSON array of approved project IDs as a psql variable `project_ids`.
-- Timestamp is captured at statement start, so query latency consumes the grant budget.
WITH allowed AS (
  SELECT DISTINCT jsonb_array_elements_text(:'project_ids'::jsonb) AS id
), grants AS (
 SELECT h.hostname, jsonb_build_object(
  'projectId', p.id, 'deploymentId', d.id, 'operationId', o.id,
  'fence', a.generation::text, 'sourceVersion', d."sourceVersion",
  'artifactHash', d."artifactHash", 'objectSha256', d."providerRef", 'activatedAt', a."activationToken"
 ) AS payload
 FROM public."BuildProject" p
 JOIN allowed s ON s.id=p.id
 JOIN public."CodeProject" c ON c.id=p."codeProjectId"
 JOIN public."BuildHostedHostname" h ON h."buildProjectId"=p.id
 JOIN public."BuildHostedActivation" a ON a."buildProjectId"=p.id
 JOIN public."BuildDeployment" d ON d.id=a."deploymentId" AND d."buildProjectId"=p.id
 JOIN public."BuildHostedPublicationOperation" o ON o."buildProjectId"=p.id AND o."expectedGeneration"=a.generation-1
 WHERE p.status<>'archived' AND p."stackId"='tanstack-start-v1' AND c."archivedAt" IS NULL
 AND a.generation>0 AND a."activationToken" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}[+]00:00$'
 AND h.hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.]sites[.]zoebuild[.]test$'
 AND d.environment='production' AND d.provider='zoebuild-hosted-runtime-v1' AND d.kind='tanstack-runtime-v1' AND d.status='ready'
 AND d."sourceVersion">0 AND d."artifactHash" ~ '^[a-f0-9]{64}$' AND d."providerRef" ~ '^[a-f0-9]{64}$'
 AND o."completedAt" IS NOT NULL AND o.action IN ('publish','rollback') AND o."requestedByOwnerId"=c."ownerId"
 AND o."targetDeploymentId"=d.id AND o."targetSourceVersion"=d."sourceVersion" AND o."targetArtifactHash"=d."artifactHash"
 AND o."targetObjectSha256"=d."providerRef" AND o."activationToken"=a."activationToken"
 AND NOT EXISTS (SELECT 1 FROM public."BuildHostedPublicationOperation" pending WHERE pending."buildProjectId"=p.id AND pending."completedAt" IS NULL)
), tick AS (SELECT floor(extract(epoch FROM statement_timestamp())*1000)::bigint AS ms)
SELECT jsonb_build_object('issuedAtMs',tick.ms,'expiresAtMs',tick.ms+10000,'grants',COALESCE((SELECT jsonb_object_agg(hostname,payload) FROM grants),'{}'::jsonb)) FROM tick;
