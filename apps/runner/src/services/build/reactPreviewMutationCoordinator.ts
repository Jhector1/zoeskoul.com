/** Serializes mutations for a single running Vite preview. Source CAS is monotonic.
 * This local fence supplements (not replaces) the database source-token check.
 * Multiple runner replicas still require shared session routing/leases.
 */
export class ReactPreviewMutationCoordinator {
  private readonly tails=new Map<string,Promise<void>>();
  async run<T>(previewId:string,operation:()=>Promise<T>):Promise<T> {
    const ahead=this.tails.get(previewId)??Promise.resolve();
    let release!:()=>void;
    const turn=new Promise<void>(resolve=>{release=resolve;});
    this.tails.set(previewId,turn);
    try {await ahead.catch(()=>{});return await operation();}
    finally {release();if(this.tails.get(previewId)===turn)this.tails.delete(previewId);}
  }
}
/** Reject an older source revision before it can replace newer runner files. */
export function assertNotStaleReactPreviewSource(saved:number,incoming:number):void {
  if(!Number.isSafeInteger(incoming)||incoming<1||incoming<saved)
    throw new Error("Preview source is stale.");
}
