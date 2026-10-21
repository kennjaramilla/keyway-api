import { randomBytes } from "node:crypto";

/** Next id with a prefix, e.g. newId("req") -> "req_m2x1k9a3f0c2". */
export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
