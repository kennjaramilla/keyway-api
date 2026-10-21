// Synced from keyway/src/lib/auth/demo-users.ts by `npm run sync:domain`. Edit it there, not here.
// No path aliases here: Cypress and proxy.ts import this file directly.

export const ROLES = ["resident", "coordinator", "manager"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  resident: "Resident",
  coordinator: "Coordinator",
  manager: "Property manager",
};

export const SESSION_COOKIE = "keyway_session";

/** Default seeded person per role (cy.signInAs, docs). Amara, Grace and Helena. */
export const DEMO_USER_IDS: Record<Role, string> = {
  resident: "usr_res_amara",
  coordinator: "usr_coord_grace",
  manager: "usr_mgr_helena",
};

export type Session = { role: Role; userId: string; activeBuildingId: string };

/**
 * Cookie value is `<role>.<userId>.<activeBuildingId>` (ids never contain dots):
 * readable by proxy.ts, the mock API and Cypress. The mock API re-checks the
 * user and building against the db, so a hand-edited cookie gains nothing.
 */
export function encodeSession(session: Session) {
  return `${session.role}.${session.userId}.${session.activeBuildingId}`;
}

export function decodeSession(value: string | undefined | null): Session | null {
  if (!value) return null;
  const [role, userId, activeBuildingId, ...rest] = decodeURIComponent(value).split(".");
  if (rest.length > 0 || !userId || !activeBuildingId || !ROLES.includes(role as Role)) return null;
  return { role: role as Role, userId, activeBuildingId };
}
