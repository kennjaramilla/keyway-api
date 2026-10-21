import { HttpException } from "@nestjs/common";

/**
 * RFC 9457-style problem details, the same shape the Keyway mock API returns:
 * `{ title, status, detail, ...extra }` (extra carries `errors` or `code`).
 */
export class Problem extends HttpException {
  constructor(status: number, title: string, detail?: string, extra?: Record<string, unknown>) {
    super({ title, status, detail, ...extra }, status);
  }
}

export const unauthorized = () => new Problem(401, "Not signed in", "Sign in to continue.");
export const forbidden = () =>
  new Problem(403, "Forbidden", "You don't have permission to do that.");
export const notFound = (what = "Resource") => new Problem(404, "Not found", `${what} not found.`);
export const conflict = (code: string, detail: string) =>
  new Problem(409, "Conflict", detail, { code });
