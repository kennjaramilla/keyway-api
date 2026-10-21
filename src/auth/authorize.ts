import { authorize as decide, type Action, type Resource } from "../domain/auth/permissions.js";
import type { SessionUser } from "../domain/session/schema.js";
import { forbidden, notFound } from "../common/problem.js";

/**
 * Throws 404 when the resource is outside the user's scope (so its existence
 * isn't revealed) and 403 for the wrong role, like the mock API's deny().
 */
export function authorize(user: SessionUser, action: Action, resource?: Resource, what?: string) {
  const decision = decide(user, action, resource);
  if (decision === "not_found") throw notFound(what);
  if (decision === "forbidden") throw forbidden();
}
