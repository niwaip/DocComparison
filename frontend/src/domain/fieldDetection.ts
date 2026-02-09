import type { Block, DetectedField, FieldRuleState } from './types'
import { escapeRegex, hashString } from './textUtils'

export const defaultFieldRuleState = (f: DetectedField): FieldRuleState => ({
  requiredAfterColon: f.kind === 'field',
  dateMonth: f.kind === 'field' && f.label.includes('日期'),
  dateFormat: f.kind === 'field' && f.label.includes('日期'),
  tableSalesItems: f.kind === 'table',
  aiPrompt: ''
})

const decodeHtmlLite = (s: string) => {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

const normalizeFieldLabel = (raw: string) => {
  let s = (raw || '').trim()
  s = s.replace(/^\s*\d+\s*[.．、]?\s*/g, '')
  s = s.replace(/^\s*[一二三四五六七八九十]+\s*[、.．]\s*/g, '')
  const idx1 = s.indexOf('：')
  const idx2 = s.indexOf(':')
  const idx = idx1 >= 0 ? idx1 : idx2
  if (idx >= 0) s = s.slice(0, idx)
  s = s.trim().replace(/\s+/g, ' ')
  return s
}

export const detectFieldsFromBlock = (b: Block): DetectedField[] => {
  const sp = b.structurePath
  if (!sp) return []
  const out: DetectedField[] = []

  const html = b.htmlFragment || ''
  const looksTableByText = () => {
    const t = b.text || ''
    if (!t) return false
    const lines = t
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
    if (lines.length < 2) return false
    const headerLike = lines.find((x) => /产品名称|型号|数量|单价|总价|合计金额/.test(x))
    if (!headerLike) return false
    const cols = headerLike.split(/\t+|\s{2,}/).map((x) => x.trim()).filter(Boolean)
    return cols.length >= 3
  }

  const isTableLike =
    b.kind === 'table' || /table/i.test(b.kind || '') || /<(table|tr|td)[\s>]/i.test(html) || looksTableByText()
  if (isTableLike) {
    const fieldId = `table::${sp}`
    out.push({ fieldId, structurePath: sp, kind: 'table', label: '表格', labelRegex: '' })
    return out
  }

  const orderedLabels: string[] = []
  const labelSeen = new Set<string>()
  const addLabel = (lab: string) => {
    const s = (lab || '').trim().replace(/\s+/g, ' ')
    if (!s) return
    if (labelSeen.has(s)) return
    labelSeen.add(s)
    orderedLabels.push(s)
  }

  const underlineSentenceShortLabels = new Set<string>()
  const knownLabels = new Set<string>(['运输方式', '交货地点', '交货日期', '最终用户', '签订日期', '签订地点', '合同编号', '买方', '卖方'])
  const isProbablyHeadingLabel = (lab: string) => {
    if (!lab) return true
    if (knownLabels.has(lab)) return false
    if (/附件/.test(lab)) return true
    if (/[、，,]/.test(lab) && /(及|以及|和)/.test(lab)) return true
    if (/(条|章节|部分|目录|说明|定义)/.test(lab) && lab.length >= 4) return true
    return false
  }

  const stripTags = (s: string) => decodeHtmlLite((s || '').replace(/<[^>]+>/g, ''))
  const isUnderlinePlaceholder = (inner: string) => {
    const t = stripTags(inner).replace(/\s+/g, '')
    if (!t) return true
    return /^[_＿—－-]{2,}$/.test(t)
  }
  const addSentenceLabel = (beforeText: string, afterText: string) => {
    const before = (beforeText || '').replace(/\s+/g, ' ').trim()
    const after = (afterText || '').replace(/\s+/g, ' ').trim()
    const afterCore = after.replace(/[，,。.;；:：\s]/g, '')
    if (!afterCore) {
      const lab = normalizeFieldLabel(before)
      if (lab && !isProbablyHeadingLabel(lab)) addLabel(lab)
      return
    }
    const sentence = `${before}___${after}`.replace(/\s+/g, ' ').trim()
    if (!sentence) return
    const shortLab = normalizeFieldLabel(before)
    if (shortLab && shortLab.length <= 12 && !isProbablyHeadingLabel(shortLab)) underlineSentenceShortLabels.add(shortLab)
    const idx = sentence.indexOf('___')
    if (idx >= 0) {
      const markers: number[] = []
      const re = /(^|[\s：:。；;])(\d{1,2})\s*[.．、]/g
      for (const m of sentence.matchAll(re)) {
        const i = (m.index ?? 0) + (m[1] ? m[1].length : 0)
        markers.push(i)
      }
      if (markers.length > 0) {
        let start = 0
        for (const i of markers) {
          if (i <= idx) start = i
          else break
        }
        let end = sentence.length
        for (const i of markers) {
          if (i > idx) {
            end = i
            break
          }
        }
        const seg = sentence.slice(start, end).trim()
        if (seg && seg.length <= 160) {
          addLabel(seg)
          return
        }
      }
    }
    if (sentence.length > 160) return
    addLabel(sentence)
  }

  const spanUnderlineRe =
    /<p[^>]*>([\s\S]*?)<span[^>]*text-decoration\s*:\s*underline[^>]*>([\s\S]*?)<\/span>([\s\S]*?)<\/p>/gi
  for (const m of html.matchAll(spanUnderlineRe)) {
    const beforeText = stripTags(m[1] || '')
    const underlineInner = m[2] || ''
    const afterText = stripTags(m[3] || '')
    if (!isUnderlinePlaceholder(underlineInner)) continue
    if (afterText.trim()) {
      addSentenceLabel(beforeText, afterText)
      continue
    }
    const lab = normalizeFieldLabel(beforeText)
    if (lab && !isProbablyHeadingLabel(lab)) addLabel(lab)
  }
  const uUnderlineRe = /<p[^>]*>([\s\S]*?)<u[^>]*>([\s\S]*?)<\/u>([\s\S]*?)<\/p>/gi
  for (const m of html.matchAll(uUnderlineRe)) {
    const beforeText = stripTags(m[1] || '')
    const underlineInner = m[2] || ''
    const afterText = stripTags(m[3] || '')
    if (!isUnderlinePlaceholder(underlineInner)) continue
    if (afterText.trim()) {
      addSentenceLabel(beforeText, afterText)
      continue
    }
    const lab = normalizeFieldLabel(beforeText)
    if (lab && !isProbablyHeadingLabel(lab)) addLabel(lab)
  }

  const lines = (b.text || '').split('\n')
  const isSectionHeadingLine = (line: string) => {
    const s = (line || '').trim()
    if (!s) return false
    if (/^\s*[一二三四五六七八九十]+\s*[、，,．.。]/.test(s)) return true
    if (/^\s*第[一二三四五六七八九十]+\s*[条章节]/.test(s)) return true
    if (/^\s*[（(]?[一二三四五六七八九十]+[)）]/.test(s)) return true
    return false
  }
  const isNumberedTitleWithColonOnly = (line: string) => {
    const s = (line || '').trim()
    if (!s) return false
    return /^\s*(?:[一二三四五六七八九十]+\s*[、.．]|第[一二三四五六七八九十]+\s*[条章节]|[（(]?[一二三四五六七八九十]+[)）]|\d+\s*[.．、])\s*[^:：]{1,30}[:：]\s*$/.test(
      s
    )
  }

  for (const line of lines) {
    const raw = (line || '').trim()
    if (!raw) continue
    if (!/[:：]/.test(raw)) continue
    if (isSectionHeadingLine(raw)) continue
    const m = raw.match(/^\s*(?:\d+\s*[.．、]\s*)?(.{1,40}?)([:：])(.*)$/)
    if (!m) continue
    const after = (m[3] || '').trim()
    const lab = normalizeFieldLabel(m[1] || '')
    if (!lab) continue
    if (lab.length > 12) continue
    if (/[、,，]/.test(lab) && /(及|以及|和)/.test(lab)) continue
    if (underlineSentenceShortLabels.has(lab)) continue
    const phAnyRe = /_{3,}|＿{3,}|—{3,}|－{3,}|-{3,}/g
    const phMatches = Array.from(raw.matchAll(phAnyRe))
    if (phMatches.length > 0) {
      const firstIdx = phMatches[0].index ?? -1
      const firstToken = phMatches[0][0] || ''
      if (firstIdx >= 0) {
        const afterPh = raw.slice(firstIdx + firstToken.length)
        const cleanedAfterPh = afterPh.replace(phAnyRe, '').trim().replace(/[，,。.;；:：]+$/g, '').trim()
        const multi = phMatches.length >= 2
        const hasTextAfterPh = cleanedAfterPh.length > 0
        if (multi || hasTextAfterPh) continue
      }
    }
    if (after === '' && isNumberedTitleWithColonOnly(raw) && !knownLabels.has(lab)) continue
    if (after === '' && isProbablyHeadingLabel(lab) && !knownLabels.has(lab)) continue
    addLabel(lab)
  }

  for (const line of lines) {
    const s = line || ''
    const phRe = /_{3,}|＿{3,}|—{3,}|－{3,}|-{3,}/g
    const matches = Array.from(s.matchAll(phRe))
    if (matches.length === 0) continue

    const firstIdx = matches[0].index ?? -1
    const firstToken = matches[0][0] || ''
    if (firstIdx < 0) continue
    const before = s.slice(0, firstIdx)
    const after = s.slice(firstIdx + firstToken.length)
    const beforeHasColon = before.includes('：') || before.includes(':')

    if (beforeHasColon) {
      const cleanedAfter = after.replace(phRe, '').trim().replace(/[，,。.;；:：]+$/g, '').trim()
      const multi = matches.length >= 2
      const hasTextAfter = cleanedAfter.length > 0
      if (multi || hasTextAfter) {
        const sentence = s.trim().replace(/\s+/g, ' ').replace(phRe, '___').trim()
        if (!sentence) continue
        if (sentence.length > 160) continue
        addLabel(sentence)
        continue
      }
      const lab = normalizeFieldLabel(before)
      if (!lab) continue
      if (lab.length > 12) continue
      if (isProbablyHeadingLabel(lab)) continue
      addLabel(lab)
      continue
    }

    const cleanedAfter = after.replace(phRe, '').trim().replace(/[，,。.;；:：]+$/g, '').trim()
    const multi = matches.length >= 2
    const hasTextAfter = cleanedAfter.length > 0
    if (multi || hasTextAfter) {
      const sentence = s.trim().replace(/\s+/g, ' ').replace(phRe, '___').trim()
      if (!sentence) continue
      if (sentence.length > 140) continue
      addLabel(sentence)
      continue
    }

    const lab = normalizeFieldLabel(before)
    if (!lab) continue
    if (lab.length > 12) continue
    if (isProbablyHeadingLabel(lab)) continue
    addLabel(lab)
  }

  const sentenceShortLabels = new Set<string>()
  for (const lab of orderedLabels) {
    const idx = lab.indexOf('___')
    if (idx < 0) continue
    const before = lab.slice(0, idx)
    const short = normalizeFieldLabel(before)
    if (short && short.length <= 12 && !isProbablyHeadingLabel(short)) sentenceShortLabels.add(short)
  }

  const finalLabels = orderedLabels.filter((lab) => {
    if (lab.includes('___')) return true
    if (sentenceShortLabels.has(lab)) return false
    return true
  })

  for (const lab of finalLabels) {
    const fieldId = `field::${sp}::${hashString(lab)}`
    out.push({ fieldId, structurePath: sp, kind: 'field', label: lab, labelRegex: escapeRegex(lab) })
  }
  return out
}
