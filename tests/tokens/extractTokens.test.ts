import { describe, expect, it } from 'vitest'
import { extractTokens } from './extractTokens'

const FIXTURE = `
:root {
  color-scheme: light;
  --bg: #f6f4ef;
  --text: #1e1d1a;
  --cat-kitchen: #d9603f;
  --cat-kitchen-soft: color-mix(in oklab, var(--cat-kitchen) 14%, var(--surface));
  --radius-card: 16px;
}

[data-theme='dark'] {
  color-scheme: dark;
  --bg: #131512;
  --text: #edebe4;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --bg: #131512;
    --text: #edebe4;
  }
}
`

describe('extractTokens', () => {
  it('reads the top-level :root block as light tokens, hex values only', () => {
    const { light } = extractTokens(FIXTURE)
    expect(light).toEqual({ bg: '#f6f4ef', text: '#1e1d1a', 'cat-kitchen': '#d9603f' })
  })

  it('reads the [data-theme="dark"] block as dark tokens', () => {
    const { dark } = extractTokens(FIXTURE)
    expect(dark).toEqual({ bg: '#131512', text: '#edebe4' })
  })

  it('reads the prefers-color-scheme dark block separately, when present', () => {
    const { darkSystem } = extractTokens(FIXTURE)
    expect(darkSystem).toEqual({ bg: '#131512', text: '#edebe4' })
  })

  it('leaves darkSystem undefined when no prefers-color-scheme block exists', () => {
    const withoutSystem = FIXTURE.replace(/@media[\s\S]*$/, '')
    const { darkSystem } = extractTokens(withoutSystem)
    expect(darkSystem).toBeUndefined()
  })

  it('throws when the file has no :root block', () => {
    expect(() => extractTokens('[data-theme="dark"] { --bg: #000; }')).toThrow()
  })

  it('throws when the file has no [data-theme="dark"] block', () => {
    expect(() => extractTokens(':root { --bg: #fff; }')).toThrow()
  })
})
