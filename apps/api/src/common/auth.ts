import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hasPermission, type Permission, type RoleCode } from '@ocs/shared';
import type { Request } from 'express';

export interface RequestUser {
  id: string;
  email: string;
  roles: RoleCode[];
  personId: string | null;
}

export interface JwtPayload {
  sub: string;
  email: string;
  roles: RoleCode[];
  personId: string | null;
}

const IS_PUBLIC = 'ocs:isPublic';
const PERMISSION = 'ocs:permission';

/** Skip authentication (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Role guard: the user needs at least one role listed for this permission in PERMISSIONS (packages/shared/src/roles.ts). */
export const RequirePermission = (perm: Permission) => SetMetadata(PERMISSION, perm);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
  if (!req.user) throw new UnauthorizedException();
  return req.user;
});

/**
 * Global guard: verifies the Bearer JWT, then checks @RequirePermission.
 * TODO(SSO): accept Microsoft Entra ID tokens (validate issuer/audience via JWKS) and map
 * Entra app roles / groups → RoleCode. Keep local login for break-glass admin only.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.access_token as string | undefined);
    if (!token) throw new UnauthorizedException('Missing bearer token');
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    req.user = { id: payload.sub, email: payload.email, roles: payload.roles, personId: payload.personId };

    const perm = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION, targets);
    if (perm && !hasPermission(req.user.roles, perm)) {
      throw new ForbiddenException(`Requires permission ${perm}`);
    }
    return true;
  }
}
