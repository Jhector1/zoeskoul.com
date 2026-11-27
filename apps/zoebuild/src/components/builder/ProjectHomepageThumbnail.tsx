"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ProjectHomepageThumbnail.module.css";

export function ProjectHomepageThumbnail({src,title,enabled,sourceVersion}:Readonly<{src:string;title:string;enabled:boolean;sourceVersion:number}>) {
  const frame=useRef<HTMLDivElement>(null);
  const [image,setImage]=useState<{url:string;version:number}|null>(null);
  const [loading,setLoading]=useState(enabled);
  const [capturing,setCapturing]=useState(false);
  useEffect(()=>{
    if(!enabled)return;
    const abort=new AbortController();
    let objectUrl:string|null=null;
    let timer:number|undefined;
    let polls=0;
    let started=false;
    async function load(){
      try{
        const response=await fetch(`${src}?display=1`,{credentials:"same-origin",cache:"no-store",signal:abort.signal});
        if(abort.signal.aborted)return;
        const pending=response.headers.get("X-ZoeBuild-Thumbnail-Capture")==="pending";
        if(response.ok && /^image\/jpeg(?:;|$)/i.test(response.headers.get("content-type")??"")){
          const version=Number(response.headers.get("X-ZoeBuild-Thumbnail-Version"));
          const blob=await response.blob();
          if(abort.signal.aborted)return;
          if(Number.isSafeInteger(version)&&version>=Math.max(1,sourceVersion-3)&&version<=sourceVersion&&blob.size>0&&blob.size<=512*1024){
            const next=URL.createObjectURL(blob);
            if(objectUrl)URL.revokeObjectURL(objectUrl);
            objectUrl=next;setImage({url:next,version});
          }
        }
        if(abort.signal.aborted)return;
        setCapturing(pending && polls<10);
        // Poll only a capture actually observed in flight. Never start one here.
        if(pending && polls++<10)timer=window.setTimeout(()=>void load(),4_000);
      }catch{if(!abort.signal.aborted)setCapturing(false);}
      finally{if(!abort.signal.aborted)setLoading(false);}
    }
    function start(){if(!started){started=true;void load();}}
    const observer=typeof IntersectionObserver!=="undefined"?new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer?.disconnect();start();}
    },{rootMargin:"150px"}):null;
    if(observer&&frame.current)observer.observe(frame.current);else start();
    return ()=>{abort.abort();observer?.disconnect();if(timer!==undefined)window.clearTimeout(timer);if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[src,enabled,sourceVersion]);
  const prior=image && image.version!==sourceVersion;
  return <div ref={frame} className={styles.frame}>
    {(!enabled||!image)&&<div className={styles.placeholder}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h.01M10 6h.01"/></svg>
      <span role="status">{!enabled?"Homepage preview not captured":capturing?"Capturing homepage…":loading?"Loading homepage…":"Open project to capture homepage"}</span>
    </div>}
    {enabled&&image&&<img className={styles.image} src={image.url} alt={`${title} homepage, source v${image.version}`} loading="lazy" decoding="async" width={1280} height={720} onError={()=>setImage(current=>current?.url===image.url?null:current)}/>}
    {enabled&&image&&(prior||capturing)&&<span role="status" className={styles.badge}>{capturing?"Updating homepage…":`Previous homepage · v${image.version}`}</span>}
  </div>;
}
