import { Controller, Get, Module, Param } from '@nestjs/common';
import { RequirePermission } from '../common/auth';

/**
 * PLACEHOLDER: later ledgers. Tables exist in the schema (SalesBond, Penalty, TPArrangement,
 * VouchFund); no logic yet. Blocked on open questions 5 (Sales Bond) and 6 (Penalty tiers).
 */
const LEDGERS = {
  bond: { model: 'SalesBond', todo: 'Sales Bond withholding and release ("half (5%)", 105% rule — open question 5)' },
  penalties: { model: 'Penalty', todo: 'Penalties and recovery tiers (open question 6)' },
  tp: { model: 'TPArrangement', todo: 'Third-party arrangements per customer' },
  vouch: { model: 'VouchFund', todo: 'Vouch fund' },
} as const;

@Controller('ledgers')
export class LedgersController {
  @Get()
  @RequirePermission('ledgers:read')
  list() {
    return Object.entries(LEDGERS).map(([key, v]) => ({ key, ...v, implemented: false }));
  }

  @Get(':kind')
  @RequirePermission('ledgers:read')
  get(@Param('kind') kind: keyof typeof LEDGERS) {
    return { kind, implemented: false, todo: LEDGERS[kind]?.todo ?? 'Unknown ledger', items: [] };
  }
}

@Module({ controllers: [LedgersController] })
export class LedgersModule {}
