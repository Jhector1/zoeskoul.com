export function validatePlan(plan: any) {
  if (!Array.isArray(plan.modules) || plan.modules.length === 0) {
    throw new Error("Plan must contain at least one module");
  }
}
