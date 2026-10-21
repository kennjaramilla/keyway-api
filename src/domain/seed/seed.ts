import { readFileSync } from "node:fs";
import { z } from "zod";
import { chargeSchema, paymentSchema } from "../billing/schema.js";
import { buildingSchema, unitSchema } from "../buildings/schema.js";
import { ruleDocumentSchema, rulePassageSchema } from "../house-rules/schema.js";
import { messageSchema, threadSchema } from "../messages/schema.js";
import { requestSchema } from "../requests/schema.js";
import { userSchema } from "../session/schema.js";
import { vendorSchema } from "../vendors/schema.js";

/** Every collection, as the shared Zod schemas describe it (same as keyway's src/mocks/seed.ts). */
export const dbSchema = z.object({
  users: z.array(userSchema),
  buildings: z.array(buildingSchema),
  units: z.array(unitSchema),
  vendors: z.array(vendorSchema),
  requests: z.array(requestSchema),
  threads: z.array(threadSchema),
  messages: z.array(messageSchema),
  ruleDocuments: z.array(ruleDocumentSchema),
  rulePassages: z.array(rulePassageSchema),
  charges: z.array(chargeSchema),
  payments: z.array(paymentSchema),
});
export type Db = z.infer<typeof dbSchema>;

const seedJson = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url), "utf8")) as {
  meta: { anchorNow: string };
} & Record<string, unknown>;

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function shiftDate(isoDate: string, days: number) {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Shift every timestamp by deltaMs; preferred-window dates by whole days; visit windows by whole hours. */
function shift(value: unknown, deltaMs: number, deltaDays: number, key?: string): unknown {
  if (typeof value === "string") {
    return ISO_DATETIME.test(value) ? new Date(Date.parse(value) + deltaMs).toISOString() : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      key === "preferredWindows" && item && typeof item === "object"
        ? { ...item, date: shiftDate((item as { date: string }).date, deltaDays) }
        : shift(item, deltaMs, deltaDays),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        shift(
          v,
          k === "visitWindow" ? Math.round(deltaMs / HOUR_MS) * HOUR_MS : deltaMs,
          deltaDays,
          k,
        ),
      ]),
    );
  }
  return value;
}

/** A fresh copy of the seed, re-timed so the data's "now" is `now`. */
export function createSeed(now: number = Date.now()): Db {
  const { meta, ...collections } = seedJson;
  const deltaMs = now - Date.parse(meta.anchorNow);
  return dbSchema.parse(shift(collections, deltaMs, Math.round(deltaMs / DAY_MS)));
}
