import React from 'react'
import type { Block, DetectedField, FieldRuleState } from '../../domain/types'
import { escapeRegex } from '../../domain/textUtils'
import { useI18n } from '../../i18n'

type Props = {
  templateBlocks: Block[]
  detectedFields: DetectedField[]
  fieldRules: Record<string, FieldRuleState>
  updateFieldRule: (fieldId: string, patch: Partial<FieldRuleState>) => void
  blockPrompts: Record<string, string>
  setBlockPrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>
  saveRuleset: () => void
  rulesetLoading: boolean
}

const titleFromPrompt = (prompt: string) => {
  const t = (prompt || '').trim().split('\n')[0] || ''
  return t.trim()
}

const renderTableFromText = (text: string) => {
  const lines = (text || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
  const splitCols = (line: string) => {
    if (line.includes('|')) return line.split('|').map((c) => c.trim()).filter((x) => x !== '')
    if (/\t/.test(line)) return line.split(/\t+/).map((c) => c.trim()).filter((x) => x !== '')
    return line.split(/\s{2,}/).map((c) => c.trim()).filter((x) => x !== '')
  }
  const rows = lines.map((line) => splitCols(line))
  const colCount = Math.max(0, ...rows.map((r) => r.length))
  const normalized = rows.map((r) => (r.length < colCount ? [...r, ...new Array(colCount - r.length).fill('')] : r))
  if (normalized.length === 0 || colCount <= 1) return null
  return (
    <table>
      <tbody>
        {normalized.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const getBlockTitle = (b: Block | null, fallbackTitle: string) => {
  const t = (b?.text || '').trim()
  if (!t) return fallbackTitle
  const line = (t.split('\n').map((x) => x.trim()).filter(Boolean)[0] || '').trim()
  const s = line.replace(/\s+/g, ' ')
  return s.length > 36 ? `${s.slice(0, 36)}…` : s
}

const findLabelExcerpt = (b: Block | null, label: string) => {
  const t = (b?.text || '').trim()
  if (!t || !label) return ''
  const lines = t.split('\n').map((x) => x.trim()).filter(Boolean)
  const placeholderRe = /_{2,}|＿{2,}|—{2,}|－{2,}|-{2,}/
  const headingishRe =
    /^\s*(?:[一二三四五六七八九十]+\s*[、.．]|第[一二三四五六七八九十]+\s*[条章节]|[（(]?[一二三四五六七八九十]+[)）]|\d+\s*[.．、])\s*[^:：]{1,40}[:：]?\s*$/
  const labelCore = String(label || '').split('___')[0] || ''
  const fieldLineRe = labelCore
    ? new RegExp(
        `^\\s*(?:[一二三四五六七八九十]+\\s*\\/\\s*\\d+\\s*)?(?:[-–—·•●]\\s*)?(?:(?:\\d+|[一二三四五六七八九十]+)\\s*[.．、)]\\s*|[（(]\\s*(?:\\d+|[一二三四五六七八九十]+)\\s*[）)]\\s*)?${escapeRegex(
          labelCore
        )}\\s*[:：]`
      )
    : null
  let best: { line: string; score: number } | null = null
  for (const line of lines) {
    if (!line.includes(label)) continue
    let score = 0
    if (placeholderRe.test(line)) score += 10
    if (headingishRe.test(line)) score -= 8
    if (fieldLineRe && fieldLineRe.test(line)) score += 12
    if (/[、，,]/.test(line) && /(及|以及|和)/.test(line) && !fieldLineRe?.test(line)) score -= 12
    if (line.length >= 12 && /[。；;]/.test(line)) score += 2
    if (!best || score > best.score) best = { line, score }
  }
  if (best) {
    const s = best.line.replace(/\s+/g, ' ').trim()
    return s.length > 70 ? `${s.slice(0, 70)}…` : s
  }
  if (!label.includes('___')) {
    const idx = t.indexOf(label)
    if (idx < 0) return ''
    const start = Math.max(0, idx - 18)
    const end = Math.min(t.length, idx + label.length + 24)
    const s = t.slice(start, end).replace(/\s+/g, ' ').trim()
    return s.length > 70 ? `${s.slice(0, 70)}…` : s
  }
  let bestPh: { line: string; score: number } | null = null
  for (const line of lines) {
    if (!placeholderRe.test(line)) continue
    let score = 0
    score += 10
    if (headingishRe.test(line)) score -= 8
    if (line.length >= 12 && /[。；;]/.test(line)) score += 2
    if (!bestPh || score > bestPh.score) bestPh = { line, score }
  }
  if (bestPh) {
    const s = bestPh.line.replace(/\s+/g, ' ').trim()
    return s.length > 70 ? `${s.slice(0, 70)}…` : s
  }
  const idx = t.indexOf(label)
  if (idx < 0) return ''
  const start = Math.max(0, idx - 18)
  const end = Math.min(t.length, idx + label.length + 24)
  const s = t.slice(start, end).replace(/\s+/g, ' ').trim()
  return s.length > 70 ? `${s.slice(0, 70)}…` : s
}

export default function BlockRulesPanel(props: Props) {
  const { t } = useI18n()
  const { templateBlocks, detectedFields, fieldRules, updateFieldRule, blockPrompts, setBlockPrompts, saveRuleset, rulesetLoading } = props

  const hasBlocks = templateBlocks.length > 0
  const hasDetected = detectedFields.length > 0
  const [blockOpen, setBlockOpen] = React.useState<Record<string, boolean>>({})

  const blockGroups = React.useMemo(() => {
    const order = new Map<string, number>()
    templateBlocks.forEach((b, idx) => order.set(b.structurePath, idx))
    const map = new Map<string, DetectedField[]>()
    for (const f of detectedFields) {
      const sp = f.structurePath
      if (!sp) continue
      const arr = map.get(sp) || []
      arr.push(f)
      map.set(sp, arr)
    }
    const groups = Array.from(map.entries()).map(([structurePath, fields]) => {
      const block = templateBlocks.find((b) => b.structurePath === structurePath) || null
      return { structurePath, block, fields }
    })
    groups.sort((a, c) => {
      const ai = order.has(a.structurePath) ? (order.get(a.structurePath) as number) : Number.MAX_SAFE_INTEGER
      const ci = order.has(c.structurePath) ? (order.get(c.structurePath) as number) : Number.MAX_SAFE_INTEGER
      if (ai !== ci) return ai - ci
      return a.structurePath.localeCompare(c.structurePath, 'zh-Hans-CN')
    })
    return groups
  }, [detectedFields, templateBlocks])

  const allExpanded = blockGroups.length > 0 && blockGroups.every((g) => blockOpen[g.structurePath] === true)

  return (
    <div id="block-config-panel" style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800 }}>{t('rules.blockRules.title')}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            disabled={!hasDetected}
            onClick={() => {
              setBlockOpen(() => {
                const next: Record<string, boolean> = {}
                for (const g of blockGroups) next[g.structurePath] = !allExpanded
                return next
              })
            }}
          >
            {allExpanded ? t('rules.blockRules.collapseAll') : t('rules.blockRules.expandAll')}
          </button>
          <button className="btn-primary" onClick={saveRuleset} disabled={rulesetLoading || !hasBlocks}>
            {rulesetLoading ? t('rules.blockRules.saving') : t('rules.blockRules.save')}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {t('rules.blockRules.loaded', {
            text: hasBlocks ? t('rules.blockRules.loaded.blocks', { count: templateBlocks.length }) : t('rules.blockRules.loaded.empty')
          })}
          <br />
          {t('rules.blockRules.onlyInputBlocks')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('rules.blockRules.aiHint')}</div>
      </div>

      {hasDetected ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {blockGroups.map((g) => {
            const checkboxStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)' }
            const sp = g.structurePath
            const excerpt = g.block ? (g.block.text || '') : ''
            const blockTitle = getBlockTitle(g.block, t('rules.blockRules.blockFallbackTitle'))
            return (
              <details
                key={sp}
                open={blockOpen[sp] === true}
                onToggle={(e) => {
                  const el = e.currentTarget as HTMLDetailsElement
                  setBlockOpen((prev) => ({ ...prev, [sp]: el.open }))
                }}
                style={{ border: '1px solid var(--control-border)', borderRadius: 12, background: 'rgba(255,255,255,0.06)' }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    padding: '10px 12px',
                    fontWeight: 850,
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{blockTitle}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{t('rules.blockRules.itemsCount', { count: g.fields.length })}</span>
                </summary>
                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1.45fr 0.85fr', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 750, marginBottom: 6 }}>{t('rules.blockRules.blockContent')}</div>
                    {g.block ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text)',
                          border: '1px solid var(--control-border)',
                          borderRadius: 10,
                          padding: 10,
                          background: 'var(--control-bg)',
                          maxWidth: '100%',
                          overflowX: 'hidden',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word'
                        }}
                      >
                        {g.block.htmlFragment ? (
                          <div dangerouslySetInnerHTML={{ __html: g.block.htmlFragment }} />
                        ) : /table/i.test(g.block.kind || '') || g.block.kind === 'table' ? (
                          renderTableFromText(g.block.text || '') || <div style={{ whiteSpace: 'pre-wrap' }}>{excerpt}</div>
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{excerpt}</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('rules.blockRules.blockContentMissing')}</div>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 750, marginBottom: 6 }}>{t('rules.blockRules.fixedRules')}</div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {g.fields.map((f) => {
                        const st =
                          fieldRules[f.fieldId] || {
                            requiredAfterColon: f.kind === 'field',
                            dateMonth: f.kind === 'field' && f.label.includes('日期'),
                            dateFormat: f.kind === 'field' && f.label.includes('日期'),
                            tableSalesItems: f.kind === 'table',
                            aiPrompt: ''
                          }
                        const title = f.kind === 'table' ? t('rules.blockRules.table') : f.label
                        const excerptLine = f.kind === 'field' ? findLabelExcerpt(g.block, f.label) : ''
                        return (
                          <div key={f.fieldId} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: 'var(--control-bg)' }}>
                            <div style={{ fontWeight: 800, fontSize: 13, textDecorationLine: 'underline', textDecorationThickness: '2px', textUnderlineOffset: '4px' }}>{title}</div>
                            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
                              {t('rules.blockRules.from', {
                                title: blockTitle,
                                excerpt: excerptLine ? t('rules.blockRules.excerpt', { excerpt: excerptLine }) : ''
                              })}
                            </div>
                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                              {f.kind === 'field' ? (
                                <>
                                  <label style={checkboxStyle}>
                                    <input type="checkbox" checked={st.requiredAfterColon} onChange={(e) => updateFieldRule(f.fieldId, { requiredAfterColon: e.target.checked })} />
                                    <span>{t('rules.blockRules.requiredAfterColon')}</span>
                                  </label>
                                  {f.label.includes('日期') && (
                                    <>
                                      <label style={checkboxStyle}>
                                        <input type="checkbox" checked={st.dateFormat} onChange={(e) => updateFieldRule(f.fieldId, { dateFormat: e.target.checked })} />
                                        <span>{t('rules.blockRules.dateFormat')}</span>
                                      </label>
                                      <label style={checkboxStyle}>
                                        <input type="checkbox" checked={st.dateMonth} onChange={(e) => updateFieldRule(f.fieldId, { dateMonth: e.target.checked })} />
                                        <span>{t('rules.blockRules.dateMonth')}</span>
                                      </label>
                                    </>
                                  )}
                                </>
                              ) : (
                                <>
                                  <label style={checkboxStyle}>
                                    <input type="checkbox" checked={st.tableSalesItems} onChange={(e) => updateFieldRule(f.fieldId, { tableSalesItems: e.target.checked })} />
                                    <span>{t('rules.blockRules.salesTable')}</span>
                                  </label>
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 750, color: 'var(--text)' }}>{t('rules.blockRules.tableAiPrompt')}</div>
                                    <textarea
                                      value={st.aiPrompt || ''}
                                      onChange={(e) => updateFieldRule(f.fieldId, { aiPrompt: e.target.value })}
                                      placeholder={t('rules.blockRules.tableAiPlaceholder')}
                                      style={{
                                        width: '100%',
                                        maxWidth: '100%',
                                        boxSizing: 'border-box',
                                        marginTop: 8,
                                        minHeight: 120,
                                        resize: 'vertical',
                                        borderRadius: 10,
                                        border: '1px solid var(--control-border)',
                                        background: 'var(--panel)',
                                        color: 'var(--text)',
                                        padding: 10,
                                        fontSize: 12,
                                        lineHeight: 1.5
                                      }}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 750, marginBottom: 6 }}>{t('rules.blockRules.aiPromptOptional')}</div>
                    {(() => {
                      const v = blockPrompts[sp] || ''
                      return (
                        <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 10, background: 'var(--control-bg)' }}>
                          <div style={{ fontWeight: 750, fontSize: 13 }}>{t('rules.blockRules.blockUnifiedPrompt')}</div>
                          <textarea
                            value={v}
                            onChange={(e) => setBlockPrompts((prev) => ({ ...prev, [sp]: e.target.value }))}
                            placeholder={t('rules.blockRules.blockAiPlaceholder')}
                            style={{
                              width: '100%',
                              maxWidth: '100%',
                              boxSizing: 'border-box',
                              marginTop: 8,
                              minHeight: 160,
                              resize: 'vertical',
                              borderRadius: 10,
                              border: '1px solid var(--control-border)',
                              background: 'var(--panel)',
                              color: 'var(--text)',
                              padding: 10,
                              fontSize: 12,
                              lineHeight: 1.5
                            }}
                          />
                          {v.trim() && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{t('rules.blockRules.promptTitle', { title: titleFromPrompt(v) || '—' })}</div>}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>{t('rules.blockRules.noneConfigurable')}</div>
      )}
    </div>
  )
}
