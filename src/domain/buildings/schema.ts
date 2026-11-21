// Synced from keyway/src/features/buildings/schema.ts by `npm run sync:domain`. Edit it there, not here.
import { z } from "zod";

export const buildingSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  address: z.string(),
  yearBuilt: z.number().int(),
  unitCount: z.number().int(),
  timezone: z.string(),
  coordinatorIds: z.array(z.string()),
  description: z.string(),
});

export const unitSchema = z.object({
  id: z.string(),
  buildingId: z.string(),
  label: z.string(),
  floor: z.number().int(),
  bedrooms: z.number().int(),
});

export const coverageSchema = z.object({
  buildings: z.array(
    z.object({ id: z.string(), name: z.string(), coordinatorIds: z.array(z.string()) }),
  ),
  coordinators: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type Coverage = z.infer<typeof coverageSchema>;

/** Body of `POST /buildings/:id/coordinator`: hand the building from one coordinator to another. */
export const reassignCoordinatorSchema = z
  .object({ fromId: z.string().min(1), toId: z.string().min(1) })
  .refine((body) => body.fromId !== body.toId, {
    message: "Pick a different coordinator",
    path: ["toId"],
  });
export type ReassignCoordinatorInput = z.infer<typeof reassignCoordinatorSchema>;

interface Coordinator {
  id: string;
  name: string;
  buildingIds: readonly string[];
}

/** Why a reassignment can't happen (409), or null when it can. Shared by MSW and keyway-api. */
export function reassignmentConflict(
  building: { id: string; coordinatorIds: readonly string[] },
  from: Coordinator,
  to: Coordinator,
): { code: string; detail: string } | null {
  if (!building.coordinatorIds.includes(from.id)) {
    return { code: "NOT_ASSIGNED", detail: `${from.name} doesn't cover this building.` };
  }
  if (building.coordinatorIds.includes(to.id)) {
    return { code: "ALREADY_ASSIGNED", detail: `${to.name} already covers this building.` };
  }
  // A coordinator with no buildings couldn't sign in, so the last one stays.
  if (from.buildingIds.length <= 1) {
    return { code: "LAST_BUILDING", detail: `${from.name} would have no buildings left.` };
  }
  return null;
}
