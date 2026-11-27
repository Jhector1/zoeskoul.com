/** Bounded JPEG structural check. This is not a full image decoder. Both
 * control planes require the fixed viewport dimensions and JPEG marker grammar. */
export const PROJECT_THUMBNAIL_MAX_BYTES=512*1024;
export function assertProjectThumbnailJpeg(bytes:Uint8Array):Uint8Array {
  const invalid=()=>{throw new Error("Invalid project thumbnail JPEG.");};
  if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>PROJECT_THUMBNAIL_MAX_BYTES||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)invalid();
  let offset=2,frame=false;
  while(offset<bytes.length-2){
    if(bytes[offset++]!==255)invalid();
    while(offset<bytes.length&&bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===undefined||marker===0||marker===216||marker===217||(marker>=208&&marker<=215)||offset+2>bytes.length)invalid();
    const length=(bytes[offset]!<<8)|bytes[offset+1]!;
    if(length<2||offset+length>bytes.length-2)invalid();
    if(marker===192||marker===193||marker===194){
      if(frame||length<8||bytes[offset+2]!==8||((bytes[offset+3]!<<8)|bytes[offset+4]!)!==720||((bytes[offset+5]!<<8)|bytes[offset+6]!)!==1280)invalid();
      frame=true;
    }
    if(marker===218){if(!frame||offset+length>=bytes.length-2)invalid();return bytes;}
    offset+=length;
  }
  return invalid();
}
