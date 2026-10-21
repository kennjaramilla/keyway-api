// Synced from keyway/src/features/dashboard/metrics.ts by `npm run sync:domain`. Edit it there, not here.
import {
  dueAt,
  isOpenStatus,
  isOverdue,
  URGENCIES,
  type MaintenanceRequest,
  type Status,
} from "../requests/schema.js";
import { addDays, localDate } from "../requests/time.js";
import type { Vendor } from "../vendors/schema.js";
import type { Dashboard, VendorState } from "./schema.js";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type Named = { id: string; name: string };
type BuildingLike = Named & { address?: string; timezone?: string };

/** Share of the target window used before an open request counts as at risk. */
const AT_RISK_SHARE = 0.5;

const isOpen = (request: MaintenanceRequest) => isOpenStatus(request.status);

function countByStatus(requests: MaintenanceRequest[]) {
  const counts: Partial<Record<Status, number>> = {};
  for (const request of requests) counts[request.status] = (counts[request.status] ?? 0) + 1;
  return counts;
}

/** Requests resolved in the 30 days before `now`. */
function resolvedRecently(requests: MaintenanceRequest[], now: Date) {
  const since = now.getTime() - 30 * DAY_MS;
  return requests.filter(
    (request) => request.resolvedAt && new Date(request.resolvedAt).getTime() >= since,
  );
}

/** Mean of resolvedAt − createdAt in hours, or null when nothing was resolved. */
export function averageResolveHours(requests: MaintenanceRequest[]) {
  const durations = requests
    .filter((request) => request.resolvedAt)
    .map(
      (request) =>
        (new Date(request.resolvedAt!).getTime() - new Date(request.createdAt).getTime()) / HOUR_MS,
    );
  if (durations.length === 0) return null;
  return durations.reduce((sum, hours) => sum + hours, 0) / durations.length;
}

const within = (iso: string | null | undefined, from: number, to: number) => {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= from && time < to;
};

const VENDOR_ORDER: VendorState[] = ["on_site", "scheduled", "assigned", "available"];

type OnTime = "met" | "atRisk" | "breached";

/** Resolved by the target, or open and still comfortably inside it. */
function onTimeState(request: MaintenanceRequest, now: Date): OnTime {
  const due = dueAt(request).getTime();
  if (request.resolvedAt) return new Date(request.resolvedAt).getTime() <= due ? "met" : "breached";
  if (now.getTime() > due) return "breached";
  const start = new Date(request.createdAt).getTime();
  return (now.getTime() - start) / (due - start) >= AT_RISK_SHARE ? "atRisk" : "met";
}

function vendorState(onSite: number, scheduled: number, assigned: number): VendorState {
  if (onSite > 0) return "on_site";
  if (scheduled > 0) return "scheduled";
  return assigned > 0 ? "assigned" : "available";
}

/** Portfolio dashboard metrics from raw requests. Pure, so the numbers are unit-tested. */
export function computeDashboard(
  requests: MaintenanceRequest[],
  buildings: BuildingLike[],
  coordinators: Named[],
  now: Date = new Date(),
  vendors: Pick<Vendor, "id" | "name" | "trade">[] = [],
): Dashboard {
  const open = requests.filter(isOpen);
  const overdue = open.filter((request) => isOverdue(request, now));
  const recent = resolvedRecently(requests, now);
  const tracked = [...open, ...recent];
  const states = new Map(tracked.map((request) => [request.id, onTimeState(request, now)]));
  const count = (list: MaintenanceRequest[], state: OnTime) =>
    list.filter((request) => states.get(request.id) === state).length;

  const nowMs = now.getTime();
  const weekAgo = nowMs - 7 * DAY_MS;
  const twoWeeksAgo = nowMs - 14 * DAY_MS;
  const timeZone = buildings[0]?.timezone ?? "UTC";
  const today = localDate(now, timeZone);
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));

  return {
    totals: {
      open: open.length,
      overdue: overdue.length,
      resolved30d: recent.length,
      avgResolveHours30d: averageResolveHours(recent),
    },
    openByBuilding: buildings.map(({ id, name }) => {
      const inBuilding = open.filter((request) => request.buildingId === id);
      return { buildingId: id, name, open: inBuilding.length, byStatus: countByStatus(inBuilding) };
    }),
    resolveTimeByBuilding: buildings.map(({ id, name }) => {
      const inBuilding = recent.filter((request) => request.buildingId === id);
      return {
        buildingId: id,
        name,
        avgHours: averageResolveHours(inBuilding),
        resolved: inBuilding.length,
      };
    }),
    overdueByUrgency: URGENCIES.map((urgency) => ({
      urgency,
      overdue: overdue.filter((request) => request.urgency === urgency).length,
    })),
    weekly: {
      opened: requests.filter((request) => within(request.createdAt, weekAgo, nowMs + 1)).length,
      openedPrev: requests.filter((request) => within(request.createdAt, twoWeeksAgo, weekAgo))
        .length,
      resolved: requests.filter((request) => within(request.resolvedAt, weekAgo, nowMs + 1)).length,
      resolvedPrev: requests.filter((request) => within(request.resolvedAt, twoWeeksAgo, weekAgo))
        .length,
    },
    daily: days.map((date) => ({
      date,
      opened: requests.filter(
        (request) => localDate(new Date(request.createdAt), timeZone) === date,
      ).length,
      resolved: requests.filter(
        (request) =>
          request.resolvedAt && localDate(new Date(request.resolvedAt), timeZone) === date,
      ).length,
    })),
    onTime: {
      met: count(tracked, "met"),
      atRisk: count(tracked, "atRisk"),
      breached: count(tracked, "breached"),
    },
    buildingHealth: buildings.map(({ id, name, address }) => {
      const inBuilding = tracked.filter((request) => request.buildingId === id);
      const met = count(inBuilding, "met") + count(inBuilding, "atRisk");
      return {
        buildingId: id,
        name,
        address: address ?? "",
        open: open.filter((request) => request.buildingId === id).length,
        overdue: overdue.filter((request) => request.buildingId === id).length,
        onTimePct: inBuilding.length ? Math.round((met / inBuilding.length) * 100) : null,
      };
    }),
    vendors: vendors
      .map(({ id, name, trade }) => {
        const mine = open.filter((request) => request.vendorId === id);
        const onSite = mine.filter((request) => request.status === "in_progress").length;
        const scheduled = mine.filter((request) => request.status === "scheduled").length;
        return {
          vendorId: id,
          name,
          trade,
          onSite,
          scheduled,
          state: vendorState(onSite, scheduled, mine.length),
        };
      })
      .sort((a, b) => VENDOR_ORDER.indexOf(a.state) - VENDOR_ORDER.indexOf(b.state)),
    workload: coordinators.map(({ id, name }) => {
      const assigned = open.filter((request) => request.coordinatorId === id);
      return { coordinatorId: id, name, open: assigned.length, byStatus: countByStatus(assigned) };
    }),
  };
}

/** Whole-number percentage of on-time work, or null when nothing is tracked. */
export function onTimeRate({ met, atRisk, breached }: Dashboard["onTime"]) {
  const total = met + atRisk + breached;
  return total ? Math.round(((met + atRisk) / total) * 100) : null;
}

/** "+3 vs last week", "−2 vs last week" or "Same as last week". */
export function formatChange(current: number, previous: number) {
  const diff = current - previous;
  if (diff === 0) return "Same as last week";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff)} vs last week`;
}

/** "2.1 days" or "5.5 hours" for a duration in hours. */
export function formatDuration(hours: number | null) {
  if (hours === null) return "No data";
  if (hours < 24) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}
