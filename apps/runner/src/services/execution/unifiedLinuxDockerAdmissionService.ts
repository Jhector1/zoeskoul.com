import { UnifiedLinuxAdmissionService } from './unifiedLinuxAdmissionService.js';
import { createUnifiedLinuxReservedDockerManager } from './unifiedLinuxReservedDockerManager.js';
import type { EnvironmentScope } from './unifiedLinuxAdmission.js';
import type { EnvironmentIdentity } from './unifiedLinuxEnvironmentManager.js';
/** Trusted composition, intentionally no default instance, route, or startup
 * registration. The host must supply real readiness and legacy exclusion;
 * the existing startup guard must not be bypassed on the shared Runner. */
export function createUnifiedLinuxDockerAdmissionService(root:string,deps:{
  scopeAllowed:(scope:EnvironmentScope)=>boolean;
  assertLegacyExcluded:(identity:EnvironmentIdentity)=>Promise<void>;
  verifyReady:(identity:EnvironmentIdentity,containerId:string)=>Promise<void>;
  maxEnvironments?:number;
  privatePilotLifetimeMinutes?:60;
}){
  let check:((identity:EnvironmentIdentity)=>void)|undefined;
  return new UnifiedLinuxAdmissionService({assertScopeHeld:identity=>{if(!check)throw Error('RESERVATION_GUARD_UNAVAILABLE');check(identity);},scopeAllowed:deps.scopeAllowed,maxEnvironments:deps.maxEnvironments,privatePilotLifetimeMinutes:deps.privatePilotLifetimeMinutes,
    createManager:authorize=>createUnifiedLinuxReservedDockerManager(root,{
      authorization:authorize,
      assertScopeReserved:async identity=>{authorize(identity);await deps.assertLegacyExcluded(identity);authorize(identity);},
      verifyReady:async(identity,containerId)=>{authorize(identity);await deps.verifyReady(identity,containerId);authorize(identity);},
    },guard=>{check=guard;})});
}
