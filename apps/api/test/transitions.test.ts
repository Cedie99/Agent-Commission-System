import { describe, expect, it } from 'vitest';
import { allowedTransitions, checkTransition, isPayeeScoped } from '../src/compute-runs/transitions';

const finance = { id: 'u-fin', roles: ['FINANCE'] as const };
const vp = { id: 'u-vp', roles: ['VP'] as const };
const as = { id: 'u-as', roles: ['AS'] as const };
const admin = { id: 'u-admin', roles: ['ADMIN'] as const };

describe('run status transitions', () => {
  it('happy path: draft → submitted → approved → locked', () => {
    expect(checkTransition({ status: 'DRAFT', submittedById: null }, 'SUBMITTED', finance).ok).toBe(true);
    expect(checkTransition({ status: 'SUBMITTED', submittedById: finance.id }, 'APPROVED', vp).ok).toBe(true);
    expect(checkTransition({ status: 'APPROVED', submittedById: finance.id }, 'LOCKED', finance).ok).toBe(true);
  });

  it('locked runs are immutable', () => {
    for (const to of ['DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED'] as const) {
      expect(checkTransition({ status: 'LOCKED', submittedById: 'x' }, to, admin)).toMatchObject({ ok: false, status: 409 });
    }
  });

  it('no skipping steps', () => {
    expect(checkTransition({ status: 'DRAFT', submittedById: null }, 'APPROVED', admin)).toMatchObject({ ok: false, status: 409 });
    expect(checkTransition({ status: 'DRAFT', submittedById: null }, 'LOCKED', admin)).toMatchObject({ ok: false, status: 409 });
    expect(checkTransition({ status: 'APPROVED', submittedById: 'x' }, 'DRAFT', admin)).toMatchObject({ ok: false, status: 409 });
  });

  it('role checks', () => {
    expect(checkTransition({ status: 'DRAFT', submittedById: null }, 'SUBMITTED', as)).toMatchObject({ ok: false, status: 403 });
    expect(checkTransition({ status: 'SUBMITTED', submittedById: 'x' }, 'APPROVED', finance)).toMatchObject({ ok: false, status: 403 });
  });

  it('segregation of duties: submitter cannot approve', () => {
    expect(checkTransition({ status: 'SUBMITTED', submittedById: admin.id }, 'APPROVED', admin)).toMatchObject({ ok: false, status: 403 });
  });

  it('submitted can be returned to draft', () => {
    expect(checkTransition({ status: 'SUBMITTED', submittedById: finance.id }, 'DRAFT', vp).ok).toBe(true);
  });

  it('lists allowed transitions for the UI', () => {
    expect(allowedTransitions({ status: 'SUBMITTED', submittedById: finance.id }, vp).map((t) => t.to)).toEqual(['APPROVED', 'DRAFT']);
    expect(allowedTransitions({ status: 'DRAFT', submittedById: null }, as)).toEqual([]);
  });

  it('payee scoping', () => {
    expect(isPayeeScoped(['AS'])).toBe(true);
    expect(isPayeeScoped(['SM'])).toBe(true);
    expect(isPayeeScoped(['VP'])).toBe(false);
    expect(isPayeeScoped(['FINANCE'])).toBe(false);
  });
});
