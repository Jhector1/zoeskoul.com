import type { RequestHandler } from "express";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { claimLearningIdeWindow, readLearningIdeWindow } from "../services/docker/startDockerSession.js";
import { LearningIdeConflictError, validLearningWindow } from "../services/sessions/learningWindowOwnership.js";
export const claimLearningIdeWindowRoute: RequestHandler = async (req,res) => {
  try {
    const actor = getRequiredActorKey(req);
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || !(Object.keys(body).length === 1 && body.intent === undefined || Object.keys(body).length === 2 && body.intent === "status") || !validLearningWindow(body.windowId)) return res.status(400).json({ok:false,error:"Invalid IDE window identity."});
    if (body.intent === "status") return res.status(200).json(readLearningIdeWindow(actor,body.windowId));
    return res.status(200).json(await claimLearningIdeWindow(actor,body.windowId));
  } catch(error) {
    if (error instanceof LearningIdeConflictError) return res.status(423).json({ok:false,error:"Existing Linux session requires a user decision."});
    const message=error instanceof Error ? error.message : "";
    const superseded=message.startsWith("IDE superseded.");
    return res.status(superseded?409:503).json({ok:false,error:superseded?message:"Previous terminal cleanup could not be verified. Try again."});
  }
};
