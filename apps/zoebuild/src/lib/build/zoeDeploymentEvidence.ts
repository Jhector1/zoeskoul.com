/** A ready database deployment record is evidence of an earlier successful
 * publish, NOT proof the public URL is reachable at this instant. */
export type ZoePublishedRecord = Readonly<{
  deploymentId:string;sourceVersion:number;deployedAt:string;publicUrl:string;
}>;
export function describeZoePublishedRecord(record:ZoePublishedRecord|null, currentSourceVersion:number) {
  if (!record) return {state:"no-ready-deployment-record" as const};
  return {state:"ready-deployment-record" as const,
    publishedSourceVersion:record.sourceVersion,
    currentSourceVersion,
    isCurrentSourcePublished:record.sourceVersion===currentSourceVersion,
    deployedAt:record.deployedAt,publicUrl:record.publicUrl,
    verificationLimit:"Ready database record, not a fresh public-URL availability probe."};
}
