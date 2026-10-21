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
