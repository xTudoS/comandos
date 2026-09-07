import { describe, it } from 'vitest'
import { RuleTester } from 'eslint'
import tsParser from '@typescript-eslint/parser'
// @ts-expect-error — local ESLint rule, plain JS module, no types
import rule from '~~/eslint-rules/no-raw-db-update.js'

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
})

const RULE_OPTIONS = [{ auditedTables: ['users', 'tasks'] }]
const NON_AUDIT_FILE = '/repo/server/api/foo.post.ts'
const AUDIT_FILE = '/repo/server/utils/audit.ts'
const TEST_FILE = '/repo/tests/integration/foo.test.ts'

describe('ESLint rule: local/no-raw-db-update', () => {
  it('covers the expected valid + invalid cases', () => {
    ruleTester.run('no-raw-db-update', rule, {
      valid: [
        // Audited table but inside audit.ts itself — exempt.
        {
          code: 'db.update(users).set({}).where(x)',
          filename: AUDIT_FILE,
          options: RULE_OPTIONS,
        },
        // Audited table but inside tests — exempt.
        {
          code: 'db.delete(users).where(x)',
          filename: TEST_FILE,
          options: RULE_OPTIONS,
        },
        // Non-audited (infra) table — update is fine anywhere.
        {
          code: 'db.update(authChallenges).set({}).where(x)',
          filename: NON_AUDIT_FILE,
          options: RULE_OPTIONS,
        },
        {
          code: 'tx.update(deviceApprovals).set({}).where(x)',
          filename: NON_AUDIT_FILE,
          options: RULE_OPTIONS,
        },
        // Unrelated `.update()` on a hasher — rule must not fire on
        // non-table identifiers.
        {
          code: "createHash('sha256').update(buf).digest()",
          filename: NON_AUDIT_FILE,
          options: RULE_OPTIONS,
        },
        // No options configured — rule is a no-op (empty allowlist).
        {
          code: 'db.update(users).set({}).where(x)',
          filename: NON_AUDIT_FILE,
          options: [],
        },
      ],
      invalid: [
        {
          code: 'db.update(users).set({ name: "y" }).where(x)',
          filename: NON_AUDIT_FILE,
          options: RULE_OPTIONS,
          errors: [{ messageId: 'forbiddenUpdate', data: { table: 'users' } }],
        },
        {
          code: 'tx.update(tasks).set({ done: true }).where(x)',
          filename: NON_AUDIT_FILE,
          options: RULE_OPTIONS,
          errors: [{ messageId: 'forbiddenUpdate', data: { table: 'tasks' } }],
        },
        {
          code: 'db.delete(users).where(x)',
          filename: NON_AUDIT_FILE,
          options: RULE_OPTIONS,
          errors: [{ messageId: 'forbiddenDelete', data: { table: 'users' } }],
        },
        // Chained: `useDb(event).update(users)` still flags.
        {
          code: 'useDb(event).update(users).set({}).where(x)',
          filename: NON_AUDIT_FILE,
          options: RULE_OPTIONS,
          errors: [{ messageId: 'forbiddenUpdate', data: { table: 'users' } }],
        },
      ],
    })
  })
})
