import { describe, expect, it } from 'vitest'
import { escapeRegex, hashString } from '../../src/domain/textUtils'

describe('textUtils', () => {
  it('hashString is deterministic and hex padded', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abcd'))
    expect(hashString('')).toMatch(/^[0-9a-f]{8}$/)
    expect(hashString('abc')).toMatch(/^[0-9a-f]{8}$/)
  })

  it('escapeRegex escapes regex metacharacters', () => {
    const raw = 'a.b*c?d^e$f{g}h(i)j|k[l]m\\n'
    const escaped = escapeRegex(raw)
    expect(escaped).toBe('a\\.b\\*c\\?d\\^e\\$f\\{g\\}h\\(i\\)j\\|k\\[l\\]m\\\\n')
    expect(new RegExp(escaped).test(raw)).toBe(true)
  })
})
