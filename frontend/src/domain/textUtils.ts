export const hashString = (input: string) => {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i)
  }
  const n = h >>> 0
  return n.toString(16).padStart(8, '0')
}

export const escapeRegex = (s: string) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const applyIndentDataAttrs = (rawHtml: string, opts?: { indentNumbered?: boolean }) => {
  const html = rawHtml || ''
  if (!html) return html
  const hasData = html.includes('data-left-pt') || html.includes('data-first-pt')
  const mayHaveParagraphs = /<(?:p|h3)[\s>]/i.test(html)
  if (!hasData && !mayHaveParagraphs) return html
  try {
    const numberedRe =
      /^\s*(?:(?:\d+(?:\.\d+){0,4})\s*[.．、)]?|[（(]?\s*\d+\s*[)）]|\d+\s*$|[一二三四五六七八九十百千]+\s*[、.．]|第[一二三四五六七八九十百千0-9]+\s*[条章节])/i
    const topHeadingRe = /^\s*(?:[一二三四五六七八九十百千]+\s*[、.．]|第[一二三四五六七八九十百千0-9]+\s*[条章节])/i
    const alphaItemRe = /^\s*[（(]\s*[a-z]\s*[)）]/i
    const numericParenItemRe = /^\s*\d+\s*[)）]/i
    const decimalSectionRe = /^\s*\d+\.(?:\d+(?:\.\d+)*)?/i
    const inTable = /<(?:table|td)\b/i.test(html)
    const treatAsTableContext = /<(?:table|td|th)\b/i.test(html)
    const indentNumbered = opts?.indentNumbered === true

    if (typeof DOMParser === 'undefined') {
      let out = html

      if (hasData) {
        out = out.replace(/<([a-z0-9]+)([^>]*?)>/gi, (m, tag: string, rawAttrs: string) => {
          if (!/data-(?:left|first)-pt\s*=\s*["']/.test(rawAttrs)) return m
          const leftM = rawAttrs.match(/\sdata-left-pt\s*=\s*["']([^"']+)["']/i)
          const firstM = rawAttrs.match(/\sdata-first-pt\s*=\s*["']([^"']+)["']/i)
          const left = leftM ? Number.parseFloat(leftM[1] || '') : Number.NaN
          const first = firstM ? Number.parseFloat(firstM[1] || '') : Number.NaN

          let attrs = rawAttrs
            .replace(/\sdata-left-pt\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\sdata-first-pt\s*=\s*["'][^"']*["']/gi, '')

          let prevStyle = ''
          const styleM = attrs.match(/\sstyle\s*=\s*(["'])(.*?)\1/i)
          if (styleM) {
            prevStyle = (styleM[2] || '').trim()
            attrs = attrs.replace(/\sstyle\s*=\s*(["']).*?\1/i, '')
          }

          const parts: string[] = []
          if (Number.isFinite(left) && Math.abs(left) > 0.01) parts.push(`padding-left: ${left}pt`)
          if (Number.isFinite(first) && Math.abs(first) > 0.01) parts.push(`text-indent: ${first}pt`)
          const nextStyle = parts.length > 0 ? (prevStyle ? `${prevStyle}; ${parts.join('; ')}` : parts.join('; ')) : prevStyle
          const styleAttr = nextStyle ? ` style="${nextStyle}"` : ''
          return `<${tag}${attrs}${styleAttr}>`
        })
      }

      if (mayHaveParagraphs) {
        let pIndex = 0
        out = out.replace(/<(p|h3)([^>]*)>([^<]*)/gi, (m, tagRaw: string, rawAttrs: string, textStart: string) => {
          const tag = (tagRaw || '').toLowerCase()
          const attrs = rawAttrs || ''
          if (/style\s*=\s*(["'])[^"']*text-indent\s*:/i.test(attrs)) return m
          if (/style\s*=\s*(["'])[^"']*(?:padding-left|margin-left)\s*:/i.test(attrs)) return m
          const normalizedTextStart = (textStart || '')
            .replace(/^(\s*[（(]\s*[a-z]\s*[)）])[\s\u00a0\u3000]+/i, '$1 ')
            .replace(/^(\s*\d+\s*[)）])[\s\u00a0\u3000]+/i, '$1 ')
          const txt = normalizedTextStart.trim()
          const isParagraph = tag === 'p'
          const isFirst = isParagraph && pIndex === 0
          if (isParagraph) pIndex += 1
          if (!txt) return m
          if (isParagraph && isFirst && topHeadingRe.test(txt)) return m

          if (isParagraph && decimalSectionRe.test(txt)) {
            const mSec = txt.match(/^\s*(\d+\.(?:\d+(?:\.\d+)*)?)/i)
            const rawSeq = (mSec?.[1] || '').trim()
            const seqForDepth = rawSeq.replace(/\.$/, '')
            const depth = seqForDepth ? seqForDepth.split('.').filter(Boolean).length : 0
            const pad = depth > 1 ? `${(depth - 1) * 24}pt` : ''
            const normalizedTextStart2 = normalizedTextStart.replace(/^(\s*\d+\.(?:\d+(?:\.\d+)*)?\.?)[\s\u00a0\u3000]+/i, '$1 ')
            if (pad) {
              if (/style\s*=\s*(["'])/i.test(attrs)) {
                return `<${tag}${attrs.replace(/style\s*=\s*(["'])(.*?)\1/i, (_mm, q: string, st: string) => {
                  const prev = (st || '').trim()
                  const next = prev ? `${prev}; padding-left: ${pad}` : `padding-left: ${pad}`
                  return `style=${q}${next}${q}`
                })}>${normalizedTextStart2}`
              }
              return `<${tag}${attrs} style="padding-left: ${pad}">${normalizedTextStart2}`
            }
            return `<${tag}${attrs}>${normalizedTextStart2}`
          }

          if (isParagraph && (alphaItemRe.test(txt) || numericParenItemRe.test(txt))) {
            if (/style\s*=\s*(["'])/i.test(attrs)) {
              return `<${tag}${attrs.replace(/style\s*=\s*(["'])(.*?)\1/i, (_mm, q: string, st: string) => {
                const prev = (st || '').trim()
                const next = prev ? `${prev}; padding-left: 24pt` : 'padding-left: 24pt'
                return `style=${q}${next}${q}`
              })}>${normalizedTextStart}`
            }
            return `<${tag}${attrs} style="padding-left: 24pt">${normalizedTextStart}`
          }
          if (!indentNumbered && !inTable && numberedRe.test(txt)) return m
          if (/style\s*=\s*(["'])/i.test(attrs)) {
            return m.replace(/style\s*=\s*(["'])(.*?)\1/i, (_mm, q: string, st: string) => {
              const prev = (st || '').trim()
              const next = prev ? `${prev}; text-indent: 2ch` : 'text-indent: 2ch'
              return `style=${q}${next}${q}`
            })
          }
          return `<${tag}${attrs} style="text-indent: 2ch">${normalizedTextStart}`
        })
      }
      return out
    }
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    const root = doc.body.firstElementChild as HTMLElement | null
    if (!root) return html
    if (hasData) {
      const els = root.querySelectorAll<HTMLElement>('[data-left-pt],[data-first-pt]')
      for (const el of Array.from(els)) {
        const left = Number.parseFloat(el.getAttribute('data-left-pt') || '')
        const first = Number.parseFloat(el.getAttribute('data-first-pt') || '')
        const styleParts: string[] = []
        if (Number.isFinite(left) && Math.abs(left) > 0.01) styleParts.push(`padding-left: ${left}pt`)
        if (Number.isFinite(first) && Math.abs(first) > 0.01) styleParts.push(`text-indent: ${first}pt`)
        if (styleParts.length > 0) {
          const prev = (el.getAttribute('style') || '').trim()
          const next = prev ? `${prev}; ${styleParts.join('; ')}` : styleParts.join('; ')
          el.setAttribute('style', next)
        }
        el.removeAttribute('data-left-pt')
        el.removeAttribute('data-first-pt')
      }
    }
    if (mayHaveParagraphs) {
      const ps = root.querySelectorAll<HTMLParagraphElement>('p')
      const arr = Array.from(ps)
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i]
        const txt = (p.textContent || '').trim()
        if (!txt) continue
        if (i === 0 && topHeadingRe.test(txt)) continue
        const prev = (p.getAttribute('style') || '').trim()
        if (/text-indent\s*:/i.test(prev)) continue
        if (/(?:^|;)\s*(?:padding-left|margin-left)\s*:/i.test(prev)) continue
        const inCell = treatAsTableContext || Boolean(p.closest('td,th'))
        if (decimalSectionRe.test(txt)) {
          const mSec = txt.match(/^\s*(\d+\.(?:\d+(?:\.\d+)*)?)/i)
          const rawSeq = (mSec?.[1] || '').trim()
          const seqForDepth = rawSeq.replace(/\.$/, '')
          const depth = seqForDepth ? seqForDepth.split('.').filter(Boolean).length : 0
          if (depth > 1) {
            const pad = `${(depth - 1) * 24}pt`
            const next = prev ? `${prev}; padding-left: ${pad}` : `padding-left: ${pad}`
            p.setAttribute('style', next)
          }
          const first = p.firstChild
          if (first && first.nodeType === 3) {
            const v = (first.nodeValue || '').replace(/^(\s*\d+\.(?:\d+(?:\.\d+)*)?\.?)[\s\u00a0\u3000]+/i, '$1 ')
            first.nodeValue = v
          }
          continue
        }
        if (alphaItemRe.test(txt) || numericParenItemRe.test(txt)) {
          const next = prev ? `${prev}; padding-left: 24pt` : 'padding-left: 24pt'
          p.setAttribute('style', next)
          const first = p.firstChild
          if (first && first.nodeType === 3) {
            const v = (first.nodeValue || '')
              .replace(/^(\s*[（(]\s*[a-z]\s*[)）])[\s\u00a0\u3000]+/i, '$1 ')
              .replace(/^(\s*\d+\s*[)）])[\s\u00a0\u3000]+/i, '$1 ')
            first.nodeValue = v
          }
          continue
        }
        if (!indentNumbered && !inCell && numberedRe.test(txt)) continue
        const next = prev ? `${prev}; text-indent: 2ch` : 'text-indent: 2ch'
        p.setAttribute('style', next)
      }

      const h3s = root.querySelectorAll<HTMLElement>('h3')
      for (const h3 of Array.from(h3s)) {
        const txt = (h3.textContent || '').trim()
        if (!txt) continue
        const prev = (h3.getAttribute('style') || '').trim()
        if (/text-indent\s*:/i.test(prev)) continue
        if (/(?:^|;)\s*(?:padding-left|margin-left)\s*:/i.test(prev)) continue
        const next = prev ? `${prev}; text-indent: 2ch` : 'text-indent: 2ch'
        h3.setAttribute('style', next)
      }
    }
    return root.innerHTML
  } catch {
    return html
  }
}
