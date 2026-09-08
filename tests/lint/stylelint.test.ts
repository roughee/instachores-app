import { describe, expect, it } from 'vitest'
import stylelint from 'stylelint'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')

describe('stylelint: no hex colours in component styles (DESIGN.md §3)', () => {
  it('fails a .vue file with a hex colour in its style block', async () => {
    const result = await stylelint.lint({
      cwd: root,
      configFile: path.join(root, '.stylelintrc.json'),
      files: [path.join(root, 'tests/lint/fixtures/vue/HexColor.vue')],
      ignoreDisables: true,
      disableDefaultIgnores: true,
      // .stylelintignore excludes fixtures from the main `npm run lint` glob;
      // point at a file that does not exist so this test lints them directly.
      ignorePath: path.join(root, 'tests/lint/.no-stylelintignore'),
    })

    const warnings = result.results.flatMap((r) => r.warnings)

    expect(result.errored).toBe(true)
    expect(warnings.some((w) => w.rule === 'color-no-hex')).toBe(true)
    expect(warnings.some((w) => w.text.includes('src/styles/tokens.css (DESIGN.md §3)'))).toBe(true)
  })

  it('passes a clean .vue file that uses tokens and color-mix', async () => {
    const result = await stylelint.lint({
      cwd: root,
      configFile: path.join(root, '.stylelintrc.json'),
      files: [path.join(root, 'tests/lint/fixtures/vue/Clean.vue')],
      ignoreDisables: true,
      disableDefaultIgnores: true,
      ignorePath: path.join(root, 'tests/lint/.no-stylelintignore'),
    })

    expect(result.errored).toBe(false)
  })
})
