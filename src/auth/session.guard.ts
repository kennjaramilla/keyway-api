import {
  createParamDecorator,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { SESSION_COOKIE, decodeSession } from "../domain/auth/demo-users.js";
import type { SessionUser } from "../domain/session/schema.js";
import { unauthorized } from "../common/problem.js";
import { Store } from "../database/store.js";

const PUBLIC = "keyway:public";
/** Opt a route out of the session check (sign-in, demo people, health). */
export const Public = () => SetMetadata(PUBLIC, true);

type AuthedRequest = Request & { user?: SessionUser };

/**
 * Resolves the session cookie against the db. Role and active building are
 * re-checked, so a hand-edited cookie can't widen scope. No session: 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: Store,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.resolve(request.cookies?.[SESSION_COOKIE]);
    if (!user) throw unauthorized();
    request.user = user;
    return true;
  }

  private async resolve(cookie: string | undefined): Promise<SessionUser | null> {
    const session = decodeSession(cookie);
    if (!session) return null;
    const user = await this.store.findById("users", session.userId);
    if (!user || user.role !== session.role) return null;
    const activeBuildingId = user.buildingIds.includes(session.activeBuildingId)
      ? session.activeBuildingId
      : user.buildingIds[0];
    return activeBuildingId ? { ...user, activeBuildingId } : null;
  }
}

/** The signed-in user (set by SessionGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthedRequest>().user as SessionUser,
);
