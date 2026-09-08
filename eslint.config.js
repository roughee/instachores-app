// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import configPrettier from 'eslint-config-prettier'

/**
 * Dependency direction, docs/Architecture.md §2: dependencies point downward
 * only. `domain/` imports nothing but `schemas/`. `data/` imports `schemas/`,
 * `domain/` (seed and demo data) and `idb-keyval`, never `vue`, `pinia` or
 * `stores/`.
 */
const noVueOrPinia = [
  {
    group: ['vue', 'pinia', '@vue/*', '@vue/**'],
    message: 'docs/Architecture.md §2: this layer is pure and must not import Vue or Pinia.',
  },
]

const domainAndSchemaRestrictions = {
  paths: [
    {
      name: 'idb-keyval',
      message: 'docs/Architecture.md §2: idb-keyval belongs to the data layer, not domain/schemas.',
    },
  ],
  patterns: [
    ...noVueOrPinia,
    {
      group: ['idb-keyval'],
      message: 'docs/Architecture.md §2: idb-keyval belongs to the data layer, not domain/schemas.',
    },
    {
      group: ['@/data/*', '@/data/**', '../data/*', '../data/**', '../../data/*', '../../data/**'],
      message: 'docs/Architecture.md §2: domain and schemas must not import the data layer.',
    },
    {
      group: ['@/stores/*', '@/stores/**', '../stores/*', '../stores/**', '../../stores/*', '../../stores/**'],
      message: 'docs/Architecture.md §2: domain and schemas must not import app state (stores).',
    },
  ],
}

const dataRestrictions = {
  patterns: [
    ...noVueOrPinia,
    {
      group: ['@/stores/*', '@/stores/**', '../stores/*', '../stores/**', '../../stores/*', '../../stores/**'],
      message: 'docs/Architecture.md §2: the data layer must not import app state (stores).',
    },
  ],
}

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'tests/lint/fixtures/**', '.claude/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Matched by directory name (not anchored to `src/`) so the same rule
    // also lints the tests/lint/fixtures/domain fixture used to prove it.
    files: ['**/domain/**/*.ts', '**/schemas/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', domainAndSchemaRestrictions],
    },
  },
  {
    files: ['**/data/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', dataRestrictions],
    },
  },
  {
    // Apps Script: plain scripts against the GAS globals; doPost, test_ and
    // setupTemplate_ are entry points the runtime calls, not dead code.
    files: ['apps-script/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        SpreadsheetApp: 'readonly',
        LockService: 'readonly',
        PropertiesService: 'readonly',
        ContentService: 'readonly',
        DriveApp: 'readonly',
        Logger: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^(doPost|doGet|test_|setupTemplate_)$' },
      ],
    },
  },
  {
    // Node scripts (screenshots, tooling).
    files: ['scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  configPrettier,
)
