import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuditInterceptor, AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { AuthGuard, Public } from './common/auth';
import { ErrorsFilter } from './common/errors.filter';
import { PrismaModule } from './common/prisma.service';
import { RedactionInterceptor } from './common/redaction';
import { ComputeRunsModule } from './compute-runs/compute-runs.module';
import { CustomersModule } from './customers/customers.module';
import { ExceptionsModule } from './exceptions/exceptions.module';
import { ImportsModule } from './imports/imports.module';
import { JobsModule } from './jobs/jobs.service';
import { LedgersModule } from './ledgers/ledgers.module';
import { PeopleModule } from './people/people.module';
import { ProductsModule } from './products/products.module';
import { RatesModule } from './rates/rates.module';
import { SettingsModule } from './settings/settings.module';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-only-secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
    }),
    PrismaModule,
    AuditModule,
    JobsModule,
    AuthModule,
    ImportsModule,
    RatesModule,
    SettingsModule,
    CustomersModule,
    PeopleModule,
    ProductsModule,
    ComputeRunsModule,
    ExceptionsModule,
    LedgersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    // Order matters: interceptors run outermost-first on the way out → redaction is applied last.
    { provide: APP_INTERCEPTOR, useClass: RedactionInterceptor },
    { provide: APP_INTERCEPTOR, useExisting: AuditInterceptor },
    { provide: APP_FILTER, useClass: ErrorsFilter },
  ],
})
export class AppModule {}
