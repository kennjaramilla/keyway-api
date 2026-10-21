// Synced from keyway/src/lib/auth/permissions.ts by `npm run sync:domain`. Edit it there, not here.
import type { Role } from "./demo-users.js";

/**
 * Single source of truth for authorization (docs/spec/product-spec.md).
 * Routes (proxy.ts), UI (nav, buttons) and the mock API all call this.
 * Pure and dependency-free so it also runs in the proxy.
 */

export const ACTIONS = [
  "session:sign-in",
  "session:sign-out",
  "demo:reset",
  "building:switch",
  "building:assign-coordinator",
  "request:create",
  "request:list",
  "request:view",
  "request:triage",
  "request:assign",
  "request:schedule",
  "request:start",
  "request:resolve",
  "request:cancel",
  "request:reopen",
  "vendor:list",
  "thread:view",
  "thread:create",
  "message:send",
  "rules:ask",
  "rules:view",
  "dashboard:view",
  "billing:view",
  "billing:pay",
  "charge:create",
] as const;
export type Action = (typeof ACTIONS)[number];

/** The signed-in user, as returned by GET /api/session. */
export type Subject = {
  id: string;
  role: Role;
  unitId: string | null;
  buildingIds: readonly string[];
  activeBuildingId: string;
};

/** Whatever the action targets. Pass the fields you have; omitted fields aren't checked. */
export type Resource = {
  buildingId?: string;
  unitId?: string;
  residentId?: string;
};

const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  resident: new Set<Action>([
    "session:sign-in",
    "session:sign-out",
    "demo:reset",
    "request:create",
    "request:list",
    "request:view",
    "request:cancel",
    "request:reopen",
    "thread:view",
    "thread:create",
    "message:send",
    "rules:ask",
    "rules:view",
    "billing:view",
    "billing:pay",
  ]),
  coordinator: new Set<Action>([
    "session:sign-in",
    "session:sign-out",
    "demo:reset",
    "building:switch",
    "request:list",
    "request:view",
    "request:triage",
    "request:assign",
    "request:schedule",
    "request:start",
    "request:resolve",
    "request:reopen",
    "vendor:list",
    "thread:view",
    "message:send",
    "rules:ask",
    "rules:view",
    "billing:view",
    "charge:create",
  ]),
  manager: new Set<Action>([
    "session:sign-in",
    "session:sign-out",
    "demo:reset",
    "building:switch",
    "building:assign-coordinator",
    "request:list",
    "request:view",
    "request:assign",
    "vendor:list",
    "rules:ask",
    "rules:view",
    "dashboard:view",
    "billing:view",
  ]),
};

/** Role-level check only (no scope). Use for route gating and navigation. */
export function roleCan(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role].has(action);
}

const inBuildings = (subject: Subject, buildingId: string | undefined) =>
  buildingId === undefined || subject.buildingIds.includes(buildingId);

const isActiveBuilding = (subject: Subject, buildingId: string | undefined) =>
  inBuildings(subject, buildingId) &&
  (buildingId ?? subject.activeBuildingId) === subject.activeBuildingId;

const ownUnit = (subject: Subject, unitId: string | undefined) =>
  subject.unitId !== null && (unitId === undefined || unitId === subject.unitId);

/** Is the resource inside the subject's tenant scope for this action? */
function inScope(subject: Subject, action: Action, resource: Resource): boolean {
  const { role } = subject;

  if (role === "resident") {
    switch (action) {
      case "request:cancel":
        return (
          ownUnit(subject, resource.unitId) && (resource.residentId ?? subject.id) === subject.id
        );
      case "thread:view":
      case "thread:create":
      case "message:send":
        return (resource.residentId ?? subject.id) === subject.id;
      case "rules:ask":
      case "rules:view":
        return inBuildings(subject, resource.buildingId);
      default:
        // create, list, view, reopen: own unit only.
        return ownUnit(subject, resource.unitId);
    }
  }

  if (role === "coordinator") {
    switch (action) {
      case "request:list":
      case "vendor:list":
      case "rules:ask":
      case "rules:view":
      case "billing:view":
        return isActiveBuilding(subject, resource.buildingId);
      default:
        // switch, view, workflow actions, threads: any covered building.
        return inBuildings(subject, resource.buildingId);
    }
  }

  // Manager: whole portfolio, but rules and billing follow the active building.
  if (action === "rules:ask" || action === "rules:view" || action === "billing:view") {
    return (resource.buildingId ?? subject.activeBuildingId) === subject.activeBuildingId;
  }
  return true;
}

/** Can this user do this action, on this resource? */
export function can(subject: Subject, action: Action, resource: Resource = {}): boolean {
  return roleCan(subject.role, action) && inScope(subject, action, resource);
}

export type Decision = "allowed" | "forbidden" | "not_found";

/**
 * For the API: a wrong role is 403, but anything outside the caller's scope is
 * 404 so callers can't learn that it exists (tenant-isolation rule 4).
 * Check `request:view` first on a resource so out-of-scope always wins.
 */
export function authorize(subject: Subject, action: Action, resource: Resource = {}): Decision {
  if (!inScope(subject, action, resource)) return "not_found";
  if (!roleCan(subject.role, action)) return "forbidden";
  return "allowed";
}
