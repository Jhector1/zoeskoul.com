import { ZOE_CHAT_MESSAGE_MAX_UTF8_BYTES } from "./zoeChatHistoryContract";
/** Completed-and-settled answers are sent over SSE for efficient delivery.
 * This is NOT live provider-token streaming: financial settlement occurs first.
 * The client rejects incomplete streams and never persists partial messages. */
export function encodeZoeAnswerEvents(answer:string):ReadableStream<Uint8Array> {
  const encoder=new TextEncoder();
  const characters=Array.from(answer);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for(let at=0;at<characters.length;at+=512) {
        const delta=characters.slice(at,at+512).join("");
        controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({text:delta})}\n\n`));
      }
      controller.enqueue(encoder.encode(`event: complete\ndata: {"ok":true}\n\n`));
      controller.close();
    },
  });
}

export async function readZoeAnswerEventStream(response:Response):Promise<string> {
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    throw new Error("Zoé returned a non-stream answer response.");
  const reader=response.body?.getReader();
  if (!reader) throw new Error("Zoé returned no answer body.");
  const decoder=new TextDecoder();
  let pending="",result="",bytes=0,completed=false;
  const parse=(raw:string)=>{
    const lines=raw.split("\n");
    const event=lines.find(x=>x.startsWith("event: "))?.slice(7);
    const body=lines.filter(x=>x.startsWith("data: ")).map(x=>x.slice(6)).join("\n");
    if (!event || !body) return;
    const data:unknown=JSON.parse(body);
    if (!data || typeof data!=="object" || Array.isArray(data)) throw new Error("Invalid Zoé answer event.");
    const record=data as Record<string,unknown>;
    if (event==="delta") {
      if (completed||typeof record.text!=="string") throw new Error("Invalid Zoé answer delta.");
      result+=record.text;
      if (new TextEncoder().encode(result).length>ZOE_CHAT_MESSAGE_MAX_UTF8_BYTES)
        throw new Error("Zoé answer exceeds the chat storage safety boundary.");
    } else if (event==="complete") {
      if(completed||record.ok!==true)throw new Error("Invalid Zoé completion.");
      completed=true;
    } else throw new Error("Unexpected Zoé answer event.");
  };
  try {
    while(true) {
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>512*1024)throw new Error("Zoé answer transport safety limit exceeded.");
      pending+=decoder.decode(value,{stream:true}).replace(/\r\n/g,"\n");
      let end:number;
      while((end=pending.indexOf("\n\n"))>=0){parse(pending.slice(0,end));pending=pending.slice(end+2);}
    }
    pending+=decoder.decode();
    if(pending.trim())throw new Error("Zoé answer stream ended in an incomplete event.");
  } finally {reader.releaseLock();}
  if(!completed||!result.trim())throw new Error("Zoé answer stream ended before completion.");
  return result;
}
