/** Display-only grouping. Local calendar dates; newest revision first. */
export type DatedRevision = Readonly<{version:number;createdAt:string}>;
export type RevisionDateGroup<T extends DatedRevision> = Readonly<{
  key:string;label:string;revisions:T[];
}>;
export function groupRevisionsByDate<T extends DatedRevision>(
  revisions: readonly T[],
  locale?: string,
): RevisionDateGroup<T>[] {
  const sorted=[...revisions].sort((a,b)=>
    new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime() || b.version-a.version);
  const groups=new Map<string,RevisionDateGroup<T>>();
  for (const revision of sorted) {
    const date=new Date(revision.createdAt);
    const key=Number.isNaN(date.getTime())?"unknown":
      `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const label=key==="unknown"?"Unknown date":
      new Intl.DateTimeFormat(locale,{weekday:"short",month:"long",day:"numeric",year:"numeric"}).format(date);
    if(!groups.has(key))groups.set(key,{key,label,revisions:[]});
    groups.get(key)!.revisions.push(revision);
  }
  return [...groups.values()];
}
