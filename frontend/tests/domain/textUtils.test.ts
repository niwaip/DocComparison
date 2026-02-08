import { describe, expect, it } from 'vitest'
import { applyIndentDataAttrs, escapeRegex, hashString } from '../../src/domain/textUtils'

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

  it('applyIndentDataAttrs converts data attrs and adds default 2ch indent', () => {
    const withData = `<p data-left-pt="12.00" data-first-pt="6.00">正文</p>`
    const out1 = applyIndentDataAttrs(withData)
    expect(out1).toContain('padding-left: 12pt')
    expect(out1).toContain('text-indent: 6pt')
    expect(out1).not.toContain('data-left-pt')
    expect(out1).not.toContain('data-first-pt')

    const plain = `<p>本协议所称的专有信息</p><p>1. 定义：</p>`
    const out2 = applyIndentDataAttrs(plain)
    expect(out2).toMatch(/<p[^>]*text-indent:\s*2ch[^>]*>本协议所称的专有信息<\/p>/)
    expect(out2).not.toMatch(/<p[^>]*text-indent:\s*2ch[^>]*>1\.\s*定义：<\/p>/)

    const out2b = applyIndentDataAttrs(plain, { indentNumbered: true })
    expect(out2b).toMatch(/<p(?![^>]*text-indent)[^>]*>1\.\s*定义：<\/p>/)

    const table = `<table><tr><td><p>二、交货方式及日期：</p><p>1． 运输方式：</p><p>2． 交货地址：</p></td></tr></table>`
    const out3 = applyIndentDataAttrs(table)
    expect(out3).toMatch(/>二、交货方式及日期：<\/p>/)
    expect(out3).toMatch(/<p(?![^>]*text-indent)[^>]*>二、交货方式及日期：<\/p>/)
    expect(out3).toMatch(/<p[^>]*text-indent:\s*2ch[^>]*>1．\s*运输方式：<\/p>/)
    expect(out3).toMatch(/<p[^>]*text-indent:\s*2ch[^>]*>2．\s*交货地址：<\/p>/)

    const td1 =
      `<td><div><div class="block-content"><p>二、交货方式及日期：</p><p>1． 运输方式：<span style="text-decoration: underline">________</span></p><p>2． 交货地址：<span style="text-decoration: underline">&nbsp;</span></p></div></div></td>`
    const out4 = applyIndentDataAttrs(td1)
    expect(out4).toMatch(/<p(?![^>]*text-indent)[^>]*>二、交货方式及日期：<\/p>/)
    expect(out4).toMatch(/<p[^>]*text-indent:\s*2ch[^>]*>1．\s*运输方式：/i)
    expect(out4).toMatch(/<p[^>]*text-indent:\s*2ch[^>]*>2．\s*交货地址：/i)

    const td3 = `<td><div><div class="block-content"><p>六、保密条款：</p><p style="padding-left: 24pt">1．甲乙双方对于根据本合同而知悉或获得的对方之商业机密和专业技术等，未经对方书面许可，不得以任何方式利用、公开或泄露给第三方。</p><p>2． 本保密条款不因本合同的终止或解除而失效。</p></div></div></td>`
    const out5 = applyIndentDataAttrs(td3)
    expect(out5).toMatch(/<p(?![^>]*text-indent)[^>]*>六、保密条款：<\/p>/)
    expect(out5).toMatch(/<p[^>]*padding-left:\s*24pt[^>]*>1．甲乙双方/iu)
    expect(out5).not.toMatch(/<p[^>]*padding-left:\s*24pt[^>]*text-indent:\s*2ch[^>]*>1．甲乙双方/iu)
    expect(out5).toMatch(/<p[^>]*text-indent:\s*2ch[^>]*>2．\s*本保密条款/iu)

    const h3 = `<h3>反腐败规定</h3>`
    const out6 = applyIndentDataAttrs(h3)
    expect(out6).toMatch(/<h3[^>]*text-indent:\s*2ch[^>]*>反腐败规定<\/h3>/iu)

    const alpha = `<p>(b)    乙方及其董事</p>`
    const out7 = applyIndentDataAttrs(alpha)
    expect(out7).toMatch(/<p[^>]*padding-left:\s*24pt[^>]*>\(b\)\s+乙方及其董事<\/p>/iu)
    expect(out7).not.toContain('(b)    乙方')

    const numParen = `<p>2)   飞行器自动飞行控制;</p>`
    const out8 = applyIndentDataAttrs(numParen)
    expect(out8).toMatch(/<p[^>]*padding-left:\s*24pt[^>]*>2\)\s+飞行器自动飞行控制;<\/p>/iu)
    expect(out8).not.toContain('2)   飞行器')

    const dec = `<p>3. 使用方式和不使用的义务：</p><p>3.1 “接收方”同意如下内容：</p><p>3.1.1 “透露方”所透露的信息只能被“接收方”用于双方上述合作；</p>`
    const out9 = applyIndentDataAttrs(dec, { indentNumbered: true })
    expect(out9).toMatch(/<p(?![^>]*padding-left)[^>]*>3\.?\s+使用方式和不使用的义务：<\/p>/iu)
    expect(out9).toMatch(/<p[^>]*padding-left:\s*24pt[^>]*>3\.1\s+“接收方”同意如下内容：<\/p>/iu)
    expect(out9).toMatch(/<p[^>]*padding-left:\s*48pt[^>]*>3\.1\.1\s+“透露方”所透露的信息只能被“接收方”用于双方上述合作；<\/p>/iu)
  })
})
