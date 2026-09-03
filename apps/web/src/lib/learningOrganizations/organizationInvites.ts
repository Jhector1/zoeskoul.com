
import "server-only";
import { UserRole } from "@zoeskoul/db";
import type { PrismaClient } from "@/lib/prisma";
import { classroomInviteExpiry,classroomInviteState,createClassroomInviteToken,hashClassroomInviteToken,maskClassroomInviteEmail } from "@/lib/invitations/inviteToken";
import { normalizeEmails } from "@/lib/teaching/recipientResolution";
export type LearningOrganizationInviteRole="admin"|"instructor";
type DB=Pick<PrismaClient,"learningOrganizationInvite">;
export const hashLearningOrganizationInviteToken=hashClassroomInviteToken;
export const createLearningOrganizationInviteToken=createClassroomInviteToken;
export const learningOrganizationInviteExpiry=classroomInviteExpiry;
export const learningOrganizationInviteState=classroomInviteState;
export { maskClassroomInviteEmail as maskLearningOrganizationInviteEmail };
export async function rotateLearningOrganizationInvite(prisma:DB,args:{organizationId:string;email:string;role:LearningOrganizationInviteRole;now?:Date}){
 const [email]=normalizeEmails([args.email]); if(!email)return null; const now=args.now??new Date(); const token=createClassroomInviteToken();
 const invite=await prisma.learningOrganizationInvite.upsert({where:{organizationId_email:{organizationId:args.organizationId,email}},create:{organizationId:args.organizationId,email,role:args.role,tokenHash:hashClassroomInviteToken(token),expiresAt:classroomInviteExpiry(now)},update:{role:args.role,tokenHash:hashClassroomInviteToken(token),expiresAt:classroomInviteExpiry(now),sentAt:null,acceptedAt:null,acceptedByUserId:null,revokedAt:null},select:{id:true,email:true,role:true,expiresAt:true}});return {invite,token};
}
export async function revokeLearningOrganizationInvite(prisma:DB,args:{organizationId:string;email:string;now?:Date}){
 const [email]=normalizeEmails([args.email]);if(!email)return null;const x=await prisma.learningOrganizationInvite.findUnique({where:{organizationId_email:{organizationId:args.organizationId,email}},select:{id:true}});if(!x)return null;return prisma.learningOrganizationInvite.update({where:{id:x.id},data:{revokedAt:args.now??new Date()},select:{id:true,email:true,role:true,revokedAt:true}});
}
export async function findLearningOrganizationInviteByToken(prisma:Pick<PrismaClient,"learningOrganizationInvite">,token:string){const raw=String(token??"").trim();if(!raw||raw.length>256)return null;return prisma.learningOrganizationInvite.findUnique({where:{tokenHash:hashClassroomInviteToken(raw)},include:{organization:{include:{owner:{select:{id:true,name:true,email:true}}}}}});}
export async function acceptLearningOrganizationInvite(prisma:PrismaClient,args:{token:string;userId:string;userEmail:string|null|undefined;now?:Date}){
 const now=args.now??new Date(), invite=await findLearningOrganizationInviteByToken(prisma,args.token);if(!invite)return {ok:false as const,reason:"not_found" as const};
 const state=classroomInviteState(invite,now);if(state==="revoked"||state==="expired")return {ok:false as const,reason:state,organization:invite.organization};
 const [email]=normalizeEmails([args.userEmail??""]);if(!email||email!==invite.email)return {ok:false as const,reason:"email_mismatch" as const,organization:invite.organization,invitedEmail:invite.email};
 if(invite.acceptedAt&&invite.acceptedByUserId&&invite.acceptedByUserId!==args.userId)return {ok:false as const,reason:"already_used" as const,organization:invite.organization};
 const account=await prisma.user.findUnique({where:{id:args.userId},select:{roles:true}});if(!account)return {ok:false as const,reason:"user_not_found" as const,organization:invite.organization};
 const teacher=account.roles.includes(UserRole.teacher)||account.roles.includes(UserRole.admin);
 await prisma.$transaction(async tx=>{await tx.learningOrganizationMember.upsert({where:{organizationId_userId:{organizationId:invite.organizationId,userId:args.userId}},create:{organizationId:invite.organizationId,userId:args.userId,role:invite.role},update:{role:invite.role}});if(!teacher)await tx.user.update({where:{id:args.userId},data:{roles:{push:UserRole.teacher}}});await tx.learningOrganizationInvite.update({where:{id:invite.id},data:{acceptedAt:invite.acceptedAt??now,acceptedByUserId:args.userId}});});
 return {ok:true as const,organization:invite.organization,role:invite.role,teacherRoleGranted:!teacher};
}
