// Synced from keyway/src/features/billing/schema.ts by `npm run sync:domain`. Edit it there, not here.
import { z } from "zod";

export const CHARGE_KINDS = ["rent", "utilities", "fee", "damage"] as const;
export const chargeKindSchema = z.enum(CHARGE_KINDS);
export type ChargeKind = z.infer<typeof chargeKindSchema>;

export const CHARGE_KIND_LABELS: Record<ChargeKind, string> = {
  rent: "Rent",
  utilities: "Utilities",
  fee: "Fee",
  damage: "Damage repair",
};

/** Saved demo payment methods. There's no card entry: the demo never handles card numbers. */
export const PAYMENT_METHODS = {
  card: "Visa ending 4242",
  bank: "Checking ending 6789",
} as const;
export const paymentMethodSchema = z.enum(["card", "bank"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Money is whole cents, never floats. */
const cents = z.number().int().positive();

export const chargeSchema = z.object({
  id: z.string(),
  buildingId: z.string(),
  unitId: z.string(),
  residentId: z.string(),
  kind: chargeKindSchema,
  description: z.string(),
  amountCents: cents,
  dueAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  paymentId: z.string().nullable(),
  /** The maintenance request a damage charge is for. */
  requestId: z.string().nullable(),
});
export type Charge = z.infer<typeof chargeSchema>;

export const paymentSchema = z.object({
  id: z.string(),
  reference: z.string(),
  buildingId: z.string(),
  unitId: z.string(),
  residentId: z.string(),
  chargeIds: z.array(z.string()).min(1),
  amountCents: cents,
  method: paymentMethodSchema,
  createdAt: z.iso.datetime(),
});
export type Payment = z.infer<typeof paymentSchema>;

/** POST /api/billing/payments */
export const paymentCreateSchema = z.object({
  chargeIds: z
    .array(z.string())
    .min(1, "Choose at least one charge to pay.")
    .refine((ids) => new Set(ids).size === ids.length, "Each charge can be paid once."),
  method: paymentMethodSchema,
});
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export type ChargeStatus = "paid" | "overdue" | "due";

export function chargeStatus(charge: Pick<Charge, "paidAt" | "dueAt">, now = Date.now()) {
  if (charge.paidAt) return "paid" satisfies ChargeStatus;
  return Date.parse(charge.dueAt) < now ? "overdue" : "due";
}

/** GET /api/billing: the resident's account. Totals are computed by the server. */
export const accountSchema = z.object({
  charges: z.array(chargeSchema),
  payments: z.array(paymentSchema),
  balanceCents: z.number().int().nonnegative(),
  overdueCents: z.number().int().nonnegative(),
});
export type Account = z.infer<typeof accountSchema>;

/** GET /api/billing/units?buildingId: one row per occupied unit, for staff. */
export const unitBalanceSchema = z.object({
  unitId: z.string(),
  unitLabel: z.string(),
  residentId: z.string(),
  residentName: z.string(),
  balanceCents: z.number().int().nonnegative(),
  overdueCents: z.number().int().nonnegative(),
  openCount: z.number().int().nonnegative(),
  lastPaymentAt: z.iso.datetime().nullable(),
});
export type UnitBalance = z.infer<typeof unitBalanceSchema>;
export const unitBalanceListSchema = z.array(unitBalanceSchema);

/** Damage charges are due this many days after they're posted. */
export const DAMAGE_DUE_DAYS = 14;
export const DAMAGE_MAX_CENTS = 500_000;

/** POST /api/requests/:id/charges: a coordinator bills the resident for damage. */
export const damageChargeSchema = z.object({
  amountCents: z
    .number({ error: "Enter an amount." })
    .int("Use dollars and cents.")
    .min(100, "The minimum is $1.00.")
    .max(DAMAGE_MAX_CENTS, "The maximum is $5,000.00."),
  description: z
    .string()
    .trim()
    .min(5, "Say what the charge is for (at least 5 characters).")
    .max(120, "Keep it under 120 characters."),
});
export type DamageChargeInput = z.infer<typeof damageChargeSchema>;

/** "12.5" or "$1,250.00" -> 1250 / 125000 cents; null when it isn't a money amount. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** "$2,450.00" */
export const formatMoney = (amountCents: number) => usd.format(amountCents / 100);
