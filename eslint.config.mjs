// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Money-safety rules. Money, liters and rates are always Decimal (decimal.js).
 * These selectors make the common float mistakes a lint error. If you truly need
 * a number (e.g. integer day counts, pagination), add
 *   // eslint-disable-next-line no-restricted-syntax -- <reason>
 * TypeScript itself rejects `decimal + decimal` and `decimal * 2`.
 */
const moneyRules = {
  'no-restricted-globals': [
    'error',
    { name: 'parseFloat', message: 'Money is Decimal. Use D() / D.fromExcel() from @ocs/shared/money.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Number', property: 'parseFloat', message: 'Money is Decimal. Use D().' },
    { object: 'Math', property: 'round', message: 'Round money with Decimal#toDecimalPlaces(2, Decimal.ROUND_HALF_UP) / roundMoney().' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.property.name='toNumber']",
      message: 'Do not convert Decimal to JS number. Keep it Decimal; serialize with toFixed().',
    },
    {
      selector: "NewExpression[callee.name='Decimal'][arguments.0.type='Literal'][arguments.0.value=type(number)]",
      message: "Construct Decimal from a string literal, e.g. D('3.50'), never from a float literal.",
    },
    {
      selector: "CallExpression[callee.name='D'][arguments.0.type='Literal'][arguments.0.value=type(number)]",
      message: "Use a string literal: D('3.50').",
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/src/routeTree.gen.ts',
      'apps/api/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['packages/engine/**/*.ts', 'packages/shared/**/*.ts', 'apps/api/src/**/*.ts', 'apps/api/prisma/**/*.ts'],
    rules: moneyRules,
  },
  {
    // The engine is pure: no DB, framework, network or filesystem imports.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@prisma/*', '@nestjs/*', 'pg', 'pg-boss', 'react', 'node:*', 'fs', 'path', 'http', 'zod'], message: 'packages/engine must stay pure.' },
          ],
        },
      ],
    },
  },
);
