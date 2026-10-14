import { Body, Controller, Get, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto, type AuthUser, type LoginResponse, type RoleCode } from '@ocs/shared';
import bcrypt from 'bcryptjs';
import { CurrentUser, Public, type JwtPayload, type RequestUser } from '../common/auth';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email }, include: { roles: true, person: true } });
    // Constant-ish time: always run bcrypt.
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!user || !ok || !user.isActive) throw new UnauthorizedException('Invalid email or password');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const roles = user.roles.map((r) => r.roleCode as RoleCode);
    const payload: JwtPayload = { sub: user.id, email: user.email, roles, personId: user.personId };
    return { accessToken: await this.jwt.signAsync(payload), user: this.view(user.id, user.email, roles, user.personId, user.person?.fullName) };
  }

  async me(u: RequestUser): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: { person: true } });
    return this.view(user.id, user.email, u.roles, user.personId, user.person?.fullName);
  }

  private view(id: string, email: string, roles: RoleCode[], personId: string | null, name?: string): AuthUser {
    return { id, email, roles, personId, displayName: name ?? email };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body(new ZodPipe(LoginDto)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user);
  }

  // TODO(SSO): GET /auth/entra/login + /auth/entra/callback (OIDC auth code + PKCE) for Microsoft Entra ID.
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
