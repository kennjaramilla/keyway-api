// Synced from keyway/src/features/dashboard/schema.ts by `npm run sync:domain`. Edit it there, not here.
import { z } from "zod";
import { categorySchema, statusSchema, urgencySchema } from "../requests/schema.js";

const statusCounts = z.partialRecord(statusSchema, z.number().int());

/** GET /api/dashboard: portfolio metrics (definitions in docs/spec/data-model.md). */
export const dashboardSchema = z.object({
  totals: z.object({
    open: z.number().int(),
    overdue: z.number().int(),
    resolved30d: z.number().int(),
    avgResolveHours30d: z.number().nullable(),
  }),
  openByBuilding: z.array(
    z.object({
      buildingId: z.string(),
      name: z.string(),
      open: z.number().int(),
      byStatus: statusCounts,
    }),
  ),
  resolveTimeByBuilding: z.array(
    z.object({
      buildingId: z.string(),
      name: z.string(),
      avgHours: z.number().nullable(),
      resolved: z.number().int(),
    }),
  ),
  overdueByUrgency: z.array(z.object({ urgency: urgencySchema, overdue: z.number().int() })),
  weekly: z.object({
    opened: z.number().int(),
    openedPrev: z.number().int(),
    resolved: z.number().int(),
    resolvedPrev: z.number().int(),
  }),
  daily: z.array(
    z.object({ date: z.iso.date(), opened: z.number().int(), resolved: z.number().int() }),
  ),
  onTime: z.object({
    met: z.number().int(),
    atRisk: z.number().int(),
    breached: z.number().int(),
  }),
  buildingHealth: z.array(
    z.object({
      buildingId: z.string(),
      name: z.string(),
      address: z.string(),
      open: z.number().int(),
      overdue: z.number().int(),
      onTimePct: z.number().nullable(),
    }),
  ),
  vendors: z.array(
    z.object({
      vendorId: z.string(),
      name: z.string(),
      trade: categorySchema,
      onSite: z.number().int(),
      scheduled: z.number().int(),
      state: z.enum(["on_site", "scheduled", "assigned", "available"]),
    }),
  ),
  workload: z.array(
    z.object({
      coordinatorId: z.string(),
      name: z.string(),
      open: z.number().int(),
      byStatus: statusCounts,
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
export type VendorState = Dashboard["vendors"][number]["state"];
