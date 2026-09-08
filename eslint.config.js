// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import configPrettier from 'eslint-config-prettier'

/**
 * Dependency direction, docs/Architecture.md §2: dependencies point downward
 * only. `domain/` imports nothing but `schemas/`. `data/` imports `schemas/`
 * (and `idb-keyval`), never `vue`, `pinia`, `stores/` or `domain/`.
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
    {
      group: ['@/domain/*', '@/domain/**', '../domain/*', '../domain/**', '../../domain/*', '../../domain/**'],
      message: 'docs/Architecture.md §2: the data layer imports schemas only, not the domain layer.',
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
  configPrettier,
)
