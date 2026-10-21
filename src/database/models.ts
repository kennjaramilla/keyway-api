import { Schema, type InferSchemaType } from "mongoose";

/**
 * Storage schemas. Ids are the app's own string ids (`req_017`), kept in `_id`;
 * timestamps are ISO-8601 UTC strings, which compare and sort correctly as text.
 * Request bodies are validated with the shared Zod schemas before they get here.
 */
const options = { versionKey: false } as const;
const id = { type: String, required: true };
const ref = { type: String, required: true, index: true };
const nullableString = { type: String, default: null };

const userSchema = new Schema(
  {
    _id: id,
    role: { type: String, required: true, enum: ["resident", "coordinator", "manager"] },
    name: { type: String, required: true },
    email: { type: String, required: true },
    unitId: nullableString,
    buildingIds: { type: [String], default: [] },
  },
  options,
);

const buildingSchema = new Schema(
  {
    _id: id,
    slug: String,
    name: { type: String, required: true },
    address: String,
    yearBuilt: Number,
    unitCount: Number,
    timezone: { type: String, required: true },
    coordinatorIds: { type: [String], default: [] },
    description: String,
  },
  options,
);

const unitSchema = new Schema(
  { _id: id, buildingId: ref, label: String, floor: Number, bedrooms: Number },
  options,
);

const vendorSchema = new Schema(
  {
    _id: id,
    name: String,
    trade: String,
    phone: String,
    buildingIds: { type: [String], index: true },
  },
  options,
);

const requestSchema = new Schema(
  {
    _id: id,
    number: { type: String, required: true, unique: true },
    buildingId: ref,
    unitId: ref,
    residentId: ref,
    coordinatorId: { type: String, required: true },
    vendorId: nullableString,
    category: String,
    urgency: String,
    status: { type: String, required: true, index: true },
    title: String,
    description: String,
    location: String,
    preferredWindows: { type: [Schema.Types.Mixed], default: [] },
    permissionToEnter: Boolean,
    entryNotes: nullableString,
    visitWindow: { type: Schema.Types.Mixed, default: null },
    createdAt: String,
    updatedAt: String,
    resolvedAt: nullableString,
    timeline: { type: [Schema.Types.Mixed], default: [] },
  },
  options,
);

const threadSchema = new Schema(
  {
    _id: id,
    requestId: { type: String, default: null },
    subject: nullableString,
    buildingId: ref,
    residentId: ref,
    coordinatorId: String,
    createdAt: String,
    lastMessageAt: String,
    lastReadAt: { type: Schema.Types.Mixed, default: {} },
  },
  { ...options, minimize: false },
);

// One thread per request; general chats (requestId null) are exempt.
threadSchema.index(
  { requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: "string" } } },
);

const messageSchema = new Schema(
  { _id: id, threadId: ref, authorId: String, body: String, createdAt: String },
  options,
);

const ruleDocumentSchema = new Schema(
  { _id: id, buildingId: ref, title: String, effectiveDate: String, version: Number },
  options,
);

const rulePassageSchema = new Schema(
  { _id: id, documentId: String, buildingId: ref, section: String, title: String, text: String },
  options,
);

const chargeSchema = new Schema(
  {
    _id: id,
    buildingId: ref,
    unitId: String,
    residentId: ref,
    kind: String,
    description: String,
    amountCents: { type: Number, required: true, min: 1 },
    dueAt: String,
    createdAt: String,
    paidAt: nullableString,
    paymentId: nullableString,
    requestId: { type: String, default: null, index: true },
  },
  options,
);

const paymentSchema = new Schema(
  {
    _id: id,
    reference: String,
    buildingId: String,
    unitId: String,
    residentId: ref,
    chargeIds: [String],
    amountCents: Number,
    method: String,
    createdAt: String,
  },
  options,
);

/** Collection name -> storage schema. Order is also the seed insert order. */
export const MODELS = {
  users: userSchema,
  buildings: buildingSchema,
  units: unitSchema,
  vendors: vendorSchema,
  requests: requestSchema,
  threads: threadSchema,
  messages: messageSchema,
  ruleDocuments: ruleDocumentSchema,
  rulePassages: rulePassageSchema,
  charges: chargeSchema,
  payments: paymentSchema,
} as const;

export type CollectionName = keyof typeof MODELS;
export type Stored<C extends CollectionName> = InferSchemaType<(typeof MODELS)[C]>;
