import type { CookieOptions, Response } from "express";
import { SESSION_COOKIE, encodeSession, type Session } from "../domain/auth/demo-users.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const options: CookieOptions = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

/** Same name and `<role>.<userId>.<buildingId>` value the frontend's proxy.ts reads. */
export function writeSession(res: Response, session: Session) {
  res.cookie(SESSION_COOKIE, encodeSession(session), { ...options, maxAge: WEEK_MS });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, options);
}
