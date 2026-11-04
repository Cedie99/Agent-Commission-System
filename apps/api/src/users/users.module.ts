import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, type RoleCode, type UserView } from '@ocs/shared';
import bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { accountProblem, type AccountChange } from './rules';

const include = { roles: true, person: true } satisfies Prisma.UserInclude;
type Row = Prisma.UserGetPayload<{ include: typeof include }>;

function view(u: Row): UserView {
  return {
    id: u.id,
    email: u.email,
    roles: u.roles.map((r) => r.roleCode as RoleCode),
    personId: u.personId,
    personCode: u.person?.code ?? null,
    personName: u.person?.fullName ?? null,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

/** What the audit log keeps about an account: never the password hash. */
const auditShape = (u: Row) => ({ email: u.email, roles: u.roles.map((r) => r.roleCode), personId: u.personId, isActive: u.isActive });

/**
 * Sign-in accounts (Admin only). Role changes take effect the next time the person signs in,
 * because roles travel in the sign-in token.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserView[]> {
    return (await this.prisma.user.findMany({ include, orderBy: { email: 'asc' } })).map(view);
  }

  async create(dto: CreateUserDto, actor: RequestUser) {
    this.check(dto, false);
    await this.assertFree(dto.email, dto.personId ?? null, null);
    const u = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        personId: dto.personId ?? null,
        isActive: dto.isActive,
        roles: { create: dto.roles.map((roleCode) => ({ roleCode })) },
      },
      include,
    });
    await this.audit.log({ userId: actor.id, action: 'user.create', entity: 'User', entityId: u.id, after: auditShape(u) });
    return view(u);
  }

  async update(id: string, dto: UpdateUserDto, actor: RequestUser) {
    const before = await this.prisma.user.findUnique({ where: { id }, include });
    if (!before) throw new NotFoundException();
    this.check(dto, id === actor.id);
    await this.assertFree(dto.email, dto.personId ?? null, id);
    const u = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      return tx.user.update({
        where: { id },
        data: { email: dto.email, personId: dto.personId ?? null, isActive: dto.isActive, roles: { create: dto.roles.map((roleCode) => ({ roleCode })) } },
        include,
      });
    });
    await this.audit.log({ userId: actor.id, action: 'user.update', entity: 'User', entityId: id, before: auditShape(before), after: auditShape(u) });
    return view(u);
  }

  async resetPassword(id: string, dto: ResetPasswordDto, actor: RequestUser) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException();
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(dto.password, 10) } });
    await this.audit.log({ userId: actor.id, action: 'user.password', entity: 'User', entityId: id });
    return { id, ok: true };
  }

  private check(change: AccountChange, isSelf: boolean) {
    const problem = accountProblem(change, { isSelf });
    if (problem) throw new BadRequestException(problem);
  }

  /** One account per email and per person; the person must exist. */
  private async assertFree(email: string, personId: string | null, exceptId: string | null) {
    const [byEmail, byPerson, person] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      personId ? this.prisma.user.findUnique({ where: { personId } }) : null,
      personId ? this.prisma.person.findUnique({ where: { id: personId } }) : null,
    ]);
    if (byEmail && byEmail.id !== exceptId) throw new ConflictException('That email already has an account.');
    if (personId && !person) throw new BadRequestException('That person does not exist in People.');
    if (byPerson && byPerson.id !== exceptId) throw new ConflictException('That person already has an account.');
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @RequirePermission('users:read')
  list() {
    return this.svc.list();
  }

  @Post()
  @RequirePermission('users:write')
  create(@Body(new ZodPipe(CreateUserDto)) dto: CreateUserDto, @CurrentUser() u: RequestUser) {
    return this.svc.create(dto, u);
  }

  @Put(':id')
  @RequirePermission('users:write')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(UpdateUserDto)) dto: UpdateUserDto, @CurrentUser() u: RequestUser) {
    return this.svc.update(id, dto, u);
  }

  @Post(':id/password')
  @RequirePermission('users:write')
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ResetPasswordDto)) dto: ResetPasswordDto, @CurrentUser() u: RequestUser) {
    return this.svc.resetPassword(id, dto, u);
  }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
