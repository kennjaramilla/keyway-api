// Synced from keyway/src/features/session/schema.ts by `npm run sync:domain`. Edit it there, not here.
import { z } from "zod";
import { buildingSchema, unitSchema } from "../buildings/schema.js";
import { ROLES } from "../auth/demo-users.js";

const roleSchema = z.enum(ROLES);

export const userSchema = z.object({
  id: z.string(),
  role: roleSchema,
  name: z.string(),
  email: z.string(),
  unitId: z.string().nullable(),
  buildingIds: z.array(z.string()),
});

/** The signed-in user as `can()` sees it: the user plus the active building. */
const sessionUserSchema = userSchema.extend({ activeBuildingId: z.string() });
export type SessionUser = z.infer<typeof sessionUserSchema>;

/** GET /api/session: who is signed in and the buildings they may see. */
export const sessionSchema = z.object({
  user: sessionUserSchema,
  buildings: z.array(buildingSchema),
  unit: unitSchema.nullable(),
});
export type SessionPayload = z.infer<typeof sessionSchema>;

/** GET /api/demo/people: the seeded people shown on the demo sign-in page. */
const demoPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
  /** "Harbor View Lofts · 4B" for residents, covered buildings otherwise. */
  context: z.string(),
});
export const demoPeopleSchema = z.array(demoPersonSchema);
export type DemoPerson = z.infer<typeof demoPersonSchema>;

export const signInSchema = z.object({ userId: z.string().min(1) });
export const switchBuildingSchema = z.object({ buildingId: z.string().min(1) });
