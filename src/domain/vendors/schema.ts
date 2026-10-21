// Synced from keyway/src/features/vendors/schema.ts by `npm run sync:domain`. Edit it there, not here.
import { z } from "zod";
import { categorySchema } from "../requests/schema.js";

export const vendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  trade: categorySchema,
  phone: z.string(),
  buildingIds: z.array(z.string()),
});
export type Vendor = z.infer<typeof vendorSchema>;
