// Synced from keyway/src/features/requests/schema.ts by `npm run sync:domain`. Edit it there, not here.
import { z } from "zod";
import { addDays, localDate, localMinutes, zonedTimeToUtc } from "./time.js";

// Enums and labels (docs/spec/data-model.md). Labels are the only UI copy for them.

export const CATEGORIES = [
  "plumbing",
  "electrical",
  "heating_cooling",
  "appliance",
  "doors_locks",
  "pest",
  "general",
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;
export const CATEGORY_LABELS: Record<Category, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  heating_cooling: "Heating & cooling",
  appliance: "Appliance",
  doors_locks: "Doors & locks",
  pest: "Pests",
  general: "General repair",
};

export const URGENCIES = ["emergency", "high", "normal", "low"] as const;
export const urgencySchema = z.enum(URGENCIES);
export type Urgency = z.infer<typeof urgencySchema>;
export const URGENCY_LABELS: Record<Urgency, string> = {
  emergency: "Emergency",
  high: "High",
  normal: "Normal",
  low: "Low",
};

/** Hours from creation before an open request counts as overdue. */
const SLA_HOURS: Record<Urgency, number> = {
  emergency: 24,
  high: 72,
  normal: 168,
  low: 336,
};

export const STATUSES = [
  "new",
  "triaged",
  "scheduled",
  "in_progress",
  "resolved",
  "cancelled",
] as const;
export const statusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof statusSchema>;
export const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  triaged: "Triaged",
  scheduled: "Scheduled",
  in_progress: "In progress",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

/** Statuses that need no more work; everything else counts as open. */
const CLOSED_STATUSES: readonly Status[] = ["resolved", "cancelled"];
export const isOpenStatus = (status: Status) => !CLOSED_STATUSES.includes(status);
export const OPEN_STATUSES: Status[] = STATUSES.filter(isOpenStatus);

export const LOCATIONS = [
  "kitchen",
  "bathroom",
  "bedroom",
  "living_room",
  "entry",
  "laundry",
  "balcony",
  "other",
] as const;
const locationSchema = z.enum(LOCATIONS);
export type Location = z.infer<typeof locationSchema>;
export const LOCATION_LABELS: Record<Location, string> = {
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  bedroom: "Bedroom",
  living_room: "Living room",
  entry: "Entry",
  laundry: "Laundry",
  balcony: "Balcony",
  other: "Other",
};

export const TIME_SLOTS = ["morning", "afternoon", "evening"] as const;
const timeSlotSchema = z.enum(TIME_SLOTS);
export type TimeSlot = z.infer<typeof timeSlotSchema>;
export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  morning: "Morning (8–12)",
  afternoon: "Afternoon (12–5)",
  evening: "Evening (5–8)",
};

const TIMELINE_EVENT_TYPES = [
  "created",
  "triaged",
  "vendor_assigned",
  "scheduled",
  "rescheduled",
  "started",
  "resolved",
  "note",
  "cancelled",
  "reopened",
] as const;
const timelineEventTypeSchema = z.enum(TIMELINE_EVENT_TYPES);

// Entities

const visitWindowSchema = z.object({ start: z.iso.datetime(), end: z.iso.datetime() });
export type VisitWindow = z.infer<typeof visitWindowSchema>;

const preferredWindowSchema = z.object({ date: z.iso.date(), slot: timeSlotSchema });
export type PreferredWindow = z.infer<typeof preferredWindowSchema>;

const timelineEventSchema = z.object({
  id: z.string(),
  type: timelineEventTypeSchema,
  at: z.iso.datetime(),
  actorId: z.string(),
  fromStatus: statusSchema.nullish(),
  toStatus: statusSchema.nullish(),
  note: z.string().nullish(),
  meta: z
    .object({ vendorId: z.string().optional(), visitWindow: visitWindowSchema.optional() })
    .nullish(),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const requestSchema = z.object({
  id: z.string(),
  number: z.string(),
  buildingId: z.string(),
  unitId: z.string(),
  residentId: z.string(),
  coordinatorId: z.string(),
  vendorId: z.string().nullable(),
  category: categorySchema,
  urgency: urgencySchema,
  status: statusSchema,
  title: z.string(),
  description: z.string(),
  location: locationSchema,
  preferredWindows: z.array(preferredWindowSchema),
  permissionToEnter: z.boolean(),
  entryNotes: z.string().nullable(),
  visitWindow: visitWindowSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  timeline: z.array(timelineEventSchema),
});
export type MaintenanceRequest = z.infer<typeof requestSchema>;

export const requestListSchema = z.array(requestSchema);

// Status machine: the UI, the MSW handlers and the tests share this table.

export type TransitionAction =
  | "request:triage"
  | "request:schedule"
  | "request:start"
  | "request:resolve"
  | "request:cancel"
  | "request:reopen";

export const TRANSITIONS: Record<Status, readonly { action: TransitionAction; to: Status }[]> = {
  new: [
    { action: "request:triage", to: "triaged" },
    { action: "request:cancel", to: "cancelled" },
  ],
  triaged: [{ action: "request:schedule", to: "scheduled" }],
  scheduled: [
    { action: "request:schedule", to: "scheduled" },
    { action: "request:start", to: "in_progress" },
  ],
  in_progress: [{ action: "request:resolve", to: "resolved" }],
  resolved: [{ action: "request:reopen", to: "in_progress" }],
  cancelled: [],
};

/** The status an action moves a request to, or null if not allowed from `from` (API: 409). */
export function nextStatus(from: Status, action: TransitionAction): Status | null {
  return TRANSITIONS[from].find((transition) => transition.action === action)?.to ?? null;
}

// Derived values

export function dueAt(request: Pick<MaintenanceRequest, "createdAt" | "urgency">) {
  return new Date(new Date(request.createdAt).getTime() + SLA_HOURS[request.urgency] * 3_600_000);
}

export function isOverdue(
  request: Pick<MaintenanceRequest, "createdAt" | "urgency" | "status">,
  now: Date = new Date(),
) {
  return isOpenStatus(request.status) && now > dueAt(request);
}

/** Days after resolving during which a request can still be reopened. */
export const REOPEN_DAYS = 7;

export function canStillReopen(
  request: Pick<MaintenanceRequest, "status" | "resolvedAt">,
  now: Date = new Date(),
) {
  if (request.status !== "resolved" || !request.resolvedAt) return false;
  return now.getTime() - new Date(request.resolvedAt).getTime() <= REOPEN_DAYS * 86_400_000;
}

// Action inputs (forms + MSW validation). `today` is building-local YYYY-MM-DD.

const createWindowSchema = z.object({
  date: z.iso.date({ error: "Choose a date." }),
  slot: z.enum(TIME_SLOTS, { error: "Choose a time of day." }),
});

const isBlankWindow = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  !(value as { date?: unknown }).date &&
  !(value as { slot?: unknown }).slot;

export function makeRequestCreateSchema(today: string) {
  const lastDay = addDays(today, 14);
  return z
    .object({
      category: z.enum(CATEGORIES, { error: "Choose a category." }),
      urgency: z.enum(URGENCIES, { error: "Choose an urgency." }),
      title: z
        .string()
        .trim()
        .min(5, "Use at least 5 characters.")
        .max(80, "Keep the title under 80 characters."),
      description: z
        .string()
        .trim()
        .min(10, "Add a few more details (at least 10 characters).")
        .max(1000, "Keep the description under 1,000 characters."),
      location: z.enum(LOCATIONS, { error: "Choose where in your unit." }),
      // Untouched blank rows in the form are dropped, not reported.
      preferredWindows: z.preprocess(
        (value) => (Array.isArray(value) ? value.filter((item) => !isBlankWindow(item)) : value),
        z
          .array(
            createWindowSchema.refine((window) => window.date >= today && window.date <= lastDay, {
              message: "Pick a date in the next 14 days.",
              path: ["date"],
            }),
          )
          .max(3, "Choose up to 3 time windows."),
      ),
      permissionToEnter: z.boolean({ error: "Choose yes or no." }),
      entryNotes: z.string().trim().max(200, "Keep entry notes under 200 characters.").optional(),
    })
    .refine((value) => value.urgency === "emergency" || value.preferredWindows.length > 0, {
      path: ["preferredWindows"],
      message: "Choose at least one time window.",
      // Run even when other fields are invalid, so every error shows on the first submit.
      when: ({ value }) =>
        Array.isArray((value as { preferredWindows?: unknown } | null)?.preferredWindows),
    })
    .refine(
      (value) =>
        new Set(value.preferredWindows.map((window) => `${window.date}:${window.slot}`)).size ===
        value.preferredWindows.length,
      { path: ["preferredWindows"], message: "Each time window must be different." },
    );
}
export type RequestCreateInput = z.input<ReturnType<typeof makeRequestCreateSchema>>;
export type RequestCreate = z.output<ReturnType<typeof makeRequestCreateSchema>>;

export const triageSchema = z.object({
  category: categorySchema.optional(),
  urgency: urgencySchema.optional(),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export const assignSchema = z.object({ vendorId: z.string().min(1, "Choose a vendor.") });

export const cancelSchema = z.object({
  reason: z.string().trim().max(500, "Keep the reason under 500 characters.").optional(),
});

export const reopenSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Say what's still wrong (at least 5 characters).")
    .max(500, "Keep the reason under 500 characters."),
});

export const resolveSchema = z.object({
  resolutionNote: z
    .string()
    .trim()
    .min(5, "Describe what was done (at least 5 characters).")
    .max(500, "Keep the note under 500 characters."),
});

// Scheduling a visit window (building-local rules, docs/spec/data-model.md).

export type ScheduleContext = { now: Date; timeZone: string; urgency: Urgency };
type WindowIssue = { field: "start" | "end"; message: string };

const HOUR_MS = 3_600_000;
const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 20 * 60;

/** Everything wrong with a visit window, so the form and the API report the same errors. */
export function visitWindowIssues(start: Date, end: Date, ctx: ScheduleContext): WindowIssue[] {
  const issues: WindowIssue[] = [];
  if (start <= ctx.now)
    issues.push({ field: "start", message: "Pick a start time in the future." });
  if (start.getTime() > ctx.now.getTime() + 30 * 24 * HOUR_MS) {
    issues.push({ field: "start", message: "Pick a date in the next 30 days." });
  }
  const hours = (end.getTime() - start.getTime()) / HOUR_MS;
  if (hours <= 0) {
    issues.push({ field: "end", message: "End the visit after it starts." });
  } else if (hours < 1 || hours > 4) {
    issues.push({ field: "end", message: "Visits must be 1 to 4 hours long." });
  } else if (localDate(start, ctx.timeZone) !== localDate(end, ctx.timeZone)) {
    issues.push({ field: "end", message: "Start and end on the same day." });
  }
  const outsideHours =
    localMinutes(start, ctx.timeZone) < OPEN_MINUTES ||
    (hours > 0 && localMinutes(end, ctx.timeZone) > CLOSE_MINUTES);
  if (ctx.urgency !== "emergency" && outsideHours) {
    issues.push({ field: "start", message: "Book between 8:00 and 20:00 building time." });
  }
  return issues;
}

/** API body for POST /requests/:id/schedule. */
export function makeScheduleSchema(ctx: ScheduleContext) {
  return visitWindowSchema.superRefine((window, refine) => {
    for (const issue of visitWindowIssues(new Date(window.start), new Date(window.end), ctx)) {
      refine.addIssue({ code: "custom", path: [issue.field], message: issue.message });
    }
  });
}

/** The schedule form: a building-local date and times, transformed into a UTC window. */
export function makeScheduleFormSchema(ctx: ScheduleContext) {
  const TIME = /^\d{2}:\d{2}$/;
  const time = z.string().regex(TIME, "Choose a time.");
  return z
    .object({ date: z.iso.date({ error: "Choose a date." }), startTime: time, endTime: time })
    .superRefine((value, refine) => {
      const complete =
        /^\d{4}-\d{2}-\d{2}$/.test(value.date) &&
        TIME.test(value.startTime) &&
        TIME.test(value.endTime);
      if (!complete) return;
      const start = zonedTimeToUtc(value.date, value.startTime, ctx.timeZone);
      const end = zonedTimeToUtc(value.date, value.endTime, ctx.timeZone);
      for (const issue of visitWindowIssues(start, end, ctx)) {
        const path = issue.field === "start" ? "startTime" : "endTime";
        refine.addIssue({ code: "custom", path: [path], message: issue.message });
      }
    })
    .transform((value) => ({
      start: zonedTimeToUtc(value.date, value.startTime, ctx.timeZone).toISOString(),
      end: zonedTimeToUtc(value.date, value.endTime, ctx.timeZone).toISOString(),
    }));
}

// Enriched API responses: names the UI needs without extra lookups.

const requestListItemSchema = requestSchema.extend({
  unitLabel: z.string(),
  vendorName: z.string().nullable(),
});
export type RequestListItem = z.infer<typeof requestListItemSchema>;
export const requestListItemsSchema = z.array(requestListItemSchema);

export const requestDetailSchema = requestListItemSchema.extend({
  buildingName: z.string(),
  timeZone: z.string(),
  vendor: z
    .object({ id: z.string(), name: z.string(), trade: categorySchema, phone: z.string() })
    .nullable(),
  /** User or vendor id -> display name, for the timeline. */
  people: z.record(z.string(), z.string()),
});
export type RequestDetail = z.infer<typeof requestDetailSchema>;
