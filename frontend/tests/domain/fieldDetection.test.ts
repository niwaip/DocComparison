import { describe, expect, it } from 'vitest'
import { detectFieldsFromBlock } from '../../src/domain/fieldDetection'
import type { Block } from '../../src/domain/types'

const mkBlock = (patch: Partial<Block>): Block => {
  return {
    blockId: patch.blockId ?? 'b1',
    kind: patch.kind ?? 'paragraph',
    structurePath: patch.structurePath ?? 'p/1',
    stableKey: patch.stableKey ?? 's1',
    text: patch.text ?? '',
    htmlFragment: patch.htmlFragment ?? '',
    meta: patch.meta ?? {}
  }
}

describe('fieldDetection', () => {
  it('detects table blocks', () => {
    const b = mkBlock({ kind: 'table', structurePath: 'tbl/1', text: '产品名称  数量  单价', htmlFragment: '<table><tr><td>产品名称</td></tr></table>' })
    const out = detectFieldsFromBlock(b)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('table')
    expect(out[0].structurePath).toBe('tbl/1')
    expect(out[0].fieldId).toBe('table::tbl/1')
  })

  it('detects short labels with colon placeholders', () => {
    const b = mkBlock({ text: '买方：____\n签订日期：＿ ＿ ＿\n' })
    const out = detectFieldsFromBlock(b)
    const labels = out.filter(x => x.kind === 'field').map(x => x.label)
    expect(labels).toContain('买方')
    expect(labels).toContain('签订日期')
  })

  it('avoids headings that end with colon only', () => {
    const b = mkBlock({ text: '一、定义：\n买方：____\n' })
    const out = detectFieldsFromBlock(b)
    const labels = out.filter(x => x.kind === 'field').map(x => x.label)
    expect(labels).toContain('买方')
    expect(labels).not.toContain('定义')
  })
})
