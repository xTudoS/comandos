/**
 * ESLint rule — forbids raw `.update(table)` / `.delete(table)` on audited
 * entity tables. Every domain mutation must go through `auditedUpdate` (or an
 * explicit `writeAudit` sibling) so the audit_log stays a trustworthy source
 * of truth.
 *
 * The rule is opt-IN by table: provide `auditedTables: string[]` in the rule
 * options, listing the drizzle table identifiers that MUST flow through the
 * audit helpers. This avoids false positives on infra tables
 * (`authChallenges`, `rateLimitCounters`, `sessions`, `verifications`,
 * `deviceApprovals` — which has its own audit writes via `writeAudit`).
 *
 * The rule exempts:
 *   - `server/utils/audit.ts` itself (where `auditedUpdate` is implemented)
 *   - anything under `tests/` (test seeds mutate freely)
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw db.update/db.delete on audited entity tables — use auditedUpdate instead.',
    },
    messages: {
      forbiddenUpdate:
        'Raw `.update({{table}})` is forbidden. Call `auditedUpdate` from ~~/server/utils/audit so the mutation is reflected in audit_log.',
      forbiddenDelete:
        'Raw `.delete({{table}})` is forbidden. Wrap the deletion in a helper that writes an audit row, or add the entity to an explicit exception list.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          auditedTables: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] || {}
    const auditedTables = new Set(options.auditedTables || [])
    const filename = context.filename || context.getFilename()
    if (filename.endsWith('server/utils/audit.ts')) return {}
    if (/[\\/]tests[\\/]/.test(filename)) return {}
    return {
      CallExpression(node) {
        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return
        if (!callee.property || callee.property.type !== 'Identifier') return
        const method = callee.property.name
        if (method !== 'update' && method !== 'delete') return
        const arg = node.arguments[0]
        if (!arg || arg.type !== 'Identifier') return
        if (!auditedTables.has(arg.name)) return
        context.report({
          node,
          messageId: method === 'update' ? 'forbiddenUpdate' : 'forbiddenDelete',
          data: { table: arg.name },
        })
      },
    }
  },
}
