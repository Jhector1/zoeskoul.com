import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { captureTanstackPreviewThumbnail } from "../services/build/tanstackPreviewThumbnail.js";

export const capturePreviewThumbnailRoute:RequestHandler=async(req,res)=>{
  if(process.env.RUNNER_EXECUTION_POOL!=="zoebuild"||process.env.ZOEBUILD_PROJECT_THUMBNAILS_ENABLED!=="true")return res.status(404).json({ok:false});
  try {
    const ownerKey=getRequiredActorKey(req),previewId=String(req.params.previewId??""), body=req.body;
    if(!/^u:[a-f0-9]{64}$/.test(ownerKey)||!/^preview_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(previewId)||!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).sort().join(",")!=="buildProjectId,sourceVersion"||typeof body.buildProjectId!=="string"||!/^[A-Za-z0-9_-]{4,128}$/.test(body.buildProjectId)||!Number.isSafeInteger(body.sourceVersion)||body.sourceVersion<1)return res.status(400).json({ok:false});
    const bodyBase64=await captureTanstackPreviewThumbnail({ownerKey,previewId,buildProjectId:body.buildProjectId,sourceVersion:body.sourceVersion});
    return res.status(200).json({ok:true,sourceVersion:body.sourceVersion,bodyBase64});
  } catch {return res.status(503).json({ok:false,code:"THUMBNAIL_UNAVAILABLE"});}
};
