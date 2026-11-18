export type AppRole =
  | "ba"
  | "part_time"
  | "management"
  | "admin"
  | "sales_manager"
  | "brand_manager";

const PRIVILEGED_ROLES = new Set(["admin", "sales_manager", "brand_manager"]);

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canSeePay(role: string | null | undefined): boolean {
  return role === "admin" || role === "sales_manager";
}

export function canSetTargets(role: string | null | undefined): boolean {
  return role === "admin" || role === "sales_manager" || role === "brand_manager";
}

export function canEditRoster(role: string | null | undefined): boolean {
  return role === "admin" || role === "sales_manager";
}

export function canEditActuals(role: string | null | undefined): boolean {
  return role === "admin" || role === "sales_manager";
}

export function canLockMonth(role: string | null | undefined): boolean {
  return role === "admin" || role === "sales_manager";
}

export function canReopenMonth(role: string | null | undefined): boolean {
  return role === "admin";
}

export function canEditCommissionSettings(role: string | null | undefined): boolean {
  return role === "admin";
}

/** Existing office screens plus the new roles that need them. */
export function canUseOfficeScreens(role: string | null | undefined): boolean {
  return role === "management" || role === "admin" || role === "sales_manager" || role === "brand_manager";
}

export function canAssignRole(actorRole: string | null | undefined, newRole: string): boolean {
  if (!PRIVILEGED_ROLES.has(newRole)) return actorRole === "admin" || actorRole === "management";
  return actorRole === "admin";
}

/**
 * Pay routes. A BA may read and edit only her own row.
 * Brand managers, part-timers, and the old management role are refused.
 */
export function payRouteDecision(
  actorRole: string | null | undefined,
  actorId: string,
  subjectUserId: string,
): "ok" | "forbidden" {
  if (canSeePay(actorRole)) return "ok";
  if (actorRole === "ba" && actorId === subjectUserId) return "ok";
  return "forbidden";
}

export function monthEditDecision(
  status: "open" | "locked",
  actorRole: string | null | undefined,
  action: "edit" | "reopen",
): "ok" | "forbidden" {
  if (action === "reopen") return canReopenMonth(actorRole) ? "ok" : "forbidden";
  if (status === "locked") return "forbidden";
  return "ok";
}
