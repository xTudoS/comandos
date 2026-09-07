import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import noRawDbUpdate from './eslint-rules/no-raw-db-update.js'

// Keep the audited-tables list in sync with domain entities that must produce
// an audit_log row on every mutation. Infra tables (sessions, verifications,
// auth_challenges, device_approvals, rate_limit_counters) are intentionally
// excluded — they either have their own audit writes or are append-only.
// Keep this list restricted to domain-entity tables that need per-field diffs
// in audit_log. State-machine tables (personInvitations, deviceApprovals) are
// excluded because their flips need race-safe UPDATEs with extra WHERE
// predicates that auditedUpdate can't express; they write explicit
// writeAudit rows instead.
const AUDITED_TABLES = [
  'users',
  'people',
  'tasks',
  'checklistItems',
  'taskAnnotations',
  'projects',
  'notes',
  'payments',
]

export default [
  {
    ignores: [
      '**/*.vue',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '**/*.json',
      'node_modules/**',
      '.nuxt/**',
      '.output/**',
      'dist/**',
      'server/db/migrations/**',
      // Worker separado de tempo real: build/lint próprios (workers/sync).
      'workers/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: {
        // Node/Nuxt/Nitro globals used throughout the server code.
        defineEventHandler: 'readonly',
        readBody: 'readonly',
        getRouterParam: 'readonly',
        getQuery: 'readonly',
        getRequestHeader: 'readonly',
        getRequestIP: 'readonly',
        useRuntimeConfig: 'readonly',
        useRequestHeaders: 'readonly',
        useState: 'readonly',
        useRoute: 'readonly',
        useFetch: 'readonly',
        navigateTo: 'readonly',
        defineNuxtRouteMiddleware: 'readonly',
        definePageMeta: 'readonly',
        onMounted: 'readonly',
        onUnmounted: 'readonly',
        ref: 'readonly',
        computed: 'readonly',
        $fetch: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        Headers: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        crypto: 'readonly',
        navigator: 'readonly',
        document: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        AuthenticatorTransport: 'readonly',
        AuthenticatorAssertionResponse: 'readonly',
        PublicKeyCredential: 'readonly',
        BufferSource: 'readonly',
        HeadersInit: 'readonly',
      },
    },
    plugins: { local: { rules: { 'no-raw-db-update': noRawDbUpdate } } },
    rules: {
      'local/no-raw-db-update': ['error', { auditedTables: AUDITED_TABLES }],
      // `no-unused-vars` is handled by TypeScript itself; turning the core
      // rule off avoids a flood of false positives on type-only imports.
      'no-unused-vars': 'off',
      // TypeScript already rejects undeclared identifiers; the core rule
      // trips on TypeScript-only syntax (type aliases, interfaces).
      'no-undef': 'off',
    },
  },
  {
    // Bulk importers emit one summary audit row, not per-row diffs. Exempted
    // so the rule doesn't reject legitimate batched inserts/updates.
    files: ['server/utils/audit.ts', 'server/utils/backupService.ts', 'tests/**'],
    rules: { 'local/no-raw-db-update': 'off' },
  },
]
