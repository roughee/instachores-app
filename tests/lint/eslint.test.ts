import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')

function lintFile(relativePath: string) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.join(root, 'eslint.config.js'),
    ignore: false,
  })
  return eslint.lintFiles([relativePath])
}

describe('eslint: dependency direction (docs/Architecture.md §2)', () => {
  it('fails a domain-layer file that imports vue', async () => {
    const results = await lintFile('tests/lint/fixtures/domain/importsVue.ts')
    const messages = results.flatMap((r) => r.messages)

    expect(results.some((r) => r.errorCount > 0)).toBe(true)
    expect(messages.some((m) => m.message.includes('Architecture.md §2'))).toBe(true)
  })

  it('passes a clean domain-layer file', async () => {
    const results = await lintFile('tests/lint/fixtures/domain/clean.ts')

    expect(results.every((r) => r.errorCount === 0)).toBe(true)
  })
})
