type Node = Readonly<{id:string;parentId?:string|null;name:string;kind:string;content?:string;binary?:unknown}>;
type Snapshot = Readonly<{nodes:readonly Node[]}>;
export type VersionFileChange = Readonly<{path:string;kind:"added"|"removed"|"changed";group:"pages"|"components"|"dependencies"|"other"}>;

function categorized(path:string): VersionFileChange["group"] {
  if (/^(?:src\/pages\/|src\/app\/|src\/routes\/)/.test(path) || /^(?:src\/App\.|index\.html$)/.test(path)) return "pages";
  if (/^(?:src\/components\/|src\/layouts\/|src\/hooks\/)/.test(path)) return "components";
  if (["package.json","pnpm-lock.yaml","zoebuild-dependency-approval.json"].includes(path)) return "dependencies";
  return "other";
}

/** Compare the complete validated snapshot bytes, not excerpts, node IDs or timestamps.
 * The response contains paths + kinds only; exclude binary/secret paths and values.
 */
export function compareSavedVersionSnapshots(before:Snapshot,after:Snapshot): Readonly<{
  changes:VersionFileChange[];counts:Record<VersionFileChange["group"],number>;scannedFiles:number;
}> {
  function paths(snapshot:Snapshot) {
    const byId=new Map(snapshot.nodes.map(n=>[n.id,n]));
    const files=new Map<string,string>();
    for (const n of snapshot.nodes) {
      if (n.kind!=="file") continue;
      const names:string[]=[];const seen=new Set<string>();
      let cur:Node|undefined=n;
      while(cur) {
        if(seen.has(cur.id)||names.length>20) {names.length=0;break;}
        seen.add(cur.id);names.unshift(cur.name);
        cur=cur.parentId?byId.get(cur.parentId):undefined;
      }
      const path=names.join("/");
      if (!path || path.includes("..") || path.includes("\\") || !/^(?:src\/|public\/|index\.html$|package\.json$|pnpm-lock\.yaml$|zoebuild-dependency-approval\.json$|vite\.config\.|tsconfig\.|postcss\.config\.)/.test(path) ||
          /(?:^|\/)(?:\.env[^/]*|\.git|node_modules|secrets?|credentials?)(?:\/|$)/i.test(path)) continue;
      // Binary assets count as changed, but contents never leave this function.
      files.set(path,JSON.stringify([n.content??null,n.binary??null]));
    }
    return files;
  }
  const a=paths(before),b=paths(after);const changes:VersionFileChange[]=[];
  const counts={pages:0,components:0,dependencies:0,other:0};
  for(const path of [...new Set([...a.keys(),...b.keys()])].sort()) {
    const old=a.get(path),now=b.get(path);
    if(old===now)continue;
    const group=categorized(path);
    changes.push({path,kind:old===undefined?"added":now===undefined?"removed":"changed",group});
    counts[group]++;
  }
  return {changes,counts,scannedFiles:new Set([...a.keys(),...b.keys()]).size};
}
