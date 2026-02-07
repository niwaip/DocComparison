import React from 'react'
import { useI18n } from '../../i18n'
import type { AlignmentRow, Block, CheckRunResponse } from '../../domain/types'
import { checkDomId } from '../check/checkDom'

type Props = {
  aiAnalyzeEnabled: boolean
  globalAnalyzeLoading: boolean
  globalAnalyzeRaw: string | null
  globalAnalyzeShowRaw: boolean
  setGlobalAnalyzeShowRaw: (updater: boolean | ((prev: boolean) => boolean)) => void
  diffRows: AlignmentRow[]
  checkRun: CheckRunResponse | null
  leftBlocks: Block[]
  rightBlocks: Block[]
  runGlobalAnalyze: () => Promise<void>
  scrollToRow: (rowId: string) => void
  setCheckPaneOpen: (updater: boolean | ((prev: boolean) => boolean)) => void
}

export default function GlobalAnalyzePanel(props: Props) {
  const {
    aiAnalyzeEnabled,
    globalAnalyzeLoading,
    globalAnalyzeRaw,
    globalAnalyzeShowRaw,
    setGlobalAnalyzeShowRaw,
    diffRows,
    checkRun,
    leftBlocks,
    rightBlocks,
    runGlobalAnalyze,
    scrollToRow,
    setCheckPaneOpen
  } = props

  const { t, lang } = useI18n()

  const getBlock = (blocks: Block[], id: string | null) => {
    if (!id) return null
    return blocks.find((b) => b.blockId === id) || null
  }

  const renderGlobalAnalyze = () => {
    const raw = (globalAnalyzeRaw || '').trim()
    if (!raw) {
      return (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {diffRows.length === 0
            ? t('globalAnalyze.empty.needDiff')
            : !aiAnalyzeEnabled
              ? t('globalAnalyze.empty.disabled')
              : globalAnalyzeLoading
                ? t('globalAnalyze.empty.loading')
                : t('globalAnalyze.empty.none')}
        </div>
      )
    }

    try {
      let parsed: any = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = null
      }

      const chipStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        border: '1px solid var(--control-border)',
        background: 'rgba(255,255,255,0.06)',
        fontSize: 11,
        fontWeight: 750,
        color: 'var(--text)'
      }

      const humanizeText = (s: any) => {
        let out = String(s || '')
        out = out.replace(/\bblockai\.[a-z0-9]+\b/gi, t('ref.thisBlock'))
        out = out.replace(/\btable\.[a-z0-9]+\b/gi, t('ref.thisTable'))
        out = out.replace(/\bfield\.[a-z0-9]+\b/gi, t('ref.thisField'))
        out = out.replace(/\br_(\d{4})\b/gi, (_m, g1) => t('label.row', { n: parseInt(String(g1), 10) }))
        out = out.replace(/\bb_(\d{4})\b/gi, (_m, g1) => t('label.block', { n: parseInt(String(g1), 10) }))
        out = out.replace(/\s{2,}/g, ' ')
        return out
      }

      const riskBadge = (level: any) => {
        const v = String(level || '').toLowerCase()
        const cfg =
          v === 'high'
            ? { bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.38)', fg: 'rgba(248,113,113,1)', text: t('risk.high') }
            : v === 'medium'
              ? { bg: 'rgba(245,158,11,0.16)', bd: 'rgba(245,158,11,0.40)', fg: 'rgba(251,191,36,1)', text: t('risk.medium') }
              : v === 'low'
                ? { bg: 'rgba(34,197,94,0.14)', bd: 'rgba(34,197,94,0.38)', fg: 'rgba(74,222,128,1)', text: t('risk.low') }
                : { bg: 'rgba(255,255,255,0.06)', bd: 'var(--control-border)', fg: 'var(--muted)', text: String(level || t('evidence.none')) }
        return <span style={{ ...chipStyle, background: cfg.bg, borderColor: cfg.bd, color: cfg.fg }}>{cfg.text}</span>
      }

      const priorityBadge = (p: any) => {
        const v = String(p || '').toLowerCase()
        const cfg =
          v === 'critical' || v === 'high'
            ? { bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.38)', fg: 'rgba(248,113,113,1)', text: v === 'critical' ? t('priority.critical') : t('priority.high') }
            : v === 'medium'
              ? { bg: 'rgba(245,158,11,0.16)', bd: 'rgba(245,158,11,0.40)', fg: 'rgba(251,191,36,1)', text: t('priority.medium') }
              : v === 'low'
                ? { bg: 'rgba(34,197,94,0.14)', bd: 'rgba(34,197,94,0.38)', fg: 'rgba(74,222,128,1)', text: t('priority.low') }
                : { bg: 'rgba(255,255,255,0.06)', bd: 'var(--control-border)', fg: 'var(--muted)', text: String(p || t('evidence.none')) }
        return <span style={{ ...chipStyle, background: cfg.bg, borderColor: cfg.bd, color: cfg.fg }}>{cfg.text}</span>
      }

      const clip = (s: string, n: number) => {
        const t0 = String(s || '').replace(/\s+/g, ' ').trim()
        if (!t0) return ''
        return t0.length > n ? `${t0.slice(0, n)}…` : t0
      }

      const labelFor = (id: string) => {
        const mRow = id.match(/^r_(\d{4})$/i)
        if (mRow) return t('label.row', { n: parseInt(mRow[1], 10) })
        const mBlock = id.match(/^b_(\d{4})$/i)
        if (mBlock) return t('label.block', { n: parseInt(mBlock[1], 10) })
        if (/^table\./i.test(id)) return t('label.tableShort')
        if (/^field\./i.test(id)) return t('label.fieldShort')
        if (/^blockai\./i.test(id)) return t('label.blockShort')
        return id
      }

      const findRowByBlockId = (bid: string) => {
        for (const r of diffRows) {
          if (r.leftBlockId === bid || r.rightBlockId === bid) return r
        }
        return null
      }

      const evidenceChips = (ids: any) => {
        const arr = Array.isArray(ids) ? ids : []
        const clean = arr.map((x) => String(x)).filter(Boolean)
        if (clean.length === 0) return <span style={{ color: 'var(--muted)' }}>{t('evidence.none')}</span>

        const wrapId = (label: string, id: string) => (lang === 'zh-CN' ? `${label}（${id}）` : `${label} (${id})`)

        const tooltipFor = (id: string) => {
          if (/^r_\d+$/i.test(id)) {
            const r = diffRows.find((x) => x.rowId === id) || null
            if (!r) return id
            const ltxt = r.leftBlockId ? clip(getBlock(leftBlocks, r.leftBlockId)?.text || '', 140) : ''
            const rtxt = r.rightBlockId ? clip(getBlock(rightBlocks, r.rightBlockId)?.text || '', 140) : ''
            const parts = [wrapId(labelFor(id), id)]
            if (ltxt) parts.push(t('evidence.left', { text: ltxt }))
            if (rtxt) parts.push(t('evidence.right', { text: rtxt }))
            return parts.join('\n')
          }

          const it = (checkRun?.items || []).find((x) => x.pointId === id) || null
          if (it) {
            const parts = [wrapId(labelFor(id), id), clip(it.title || '', 80), clip(it.message || '', 180)]
            const ex = clip(it.evidence?.excerpt || '', 200)
            if (ex) parts.push(t('evidence.excerpt', { text: ex }))
            return parts.filter(Boolean).join('\n')
          }

          const r = findRowByBlockId(id)
          if (r) {
            const ltxt = r.leftBlockId ? clip(getBlock(leftBlocks, r.leftBlockId)?.text || '', 140) : ''
            const rtxt = r.rightBlockId ? clip(getBlock(rightBlocks, r.rightBlockId)?.text || '', 140) : ''
            const parts = [wrapId(labelFor(id), id), t('evidence.rowAt', { label: labelFor(r.rowId), id: r.rowId })]
            if (ltxt) parts.push(t('evidence.left', { text: ltxt }))
            if (rtxt) parts.push(t('evidence.right', { text: rtxt }))
            return parts.join('\n')
          }

          const b = getBlock(leftBlocks, id) || getBlock(rightBlocks, id)
          if (b) {
            const tx = clip(b.text || '', 220)
            const head = wrapId(labelFor(id), id)
            return tx ? `${head}\n${tx}` : head
          }

          return wrapId(labelFor(id), id)
        }

        const jumpToEvidence = (id: string) => {
          if (/^r_\d+$/i.test(id)) {
            scrollToRow(id)
            return
          }

          const r = findRowByBlockId(id)
          if (r) {
            scrollToRow(r.rowId)
            return
          }

          const it = (checkRun?.items || []).find((x) => x.pointId === id) || null
          if (it) {
            setCheckPaneOpen(true)
            window.setTimeout(() => {
              const el = document.getElementById(checkDomId(id))
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 80)
          }
        }

        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {clean.map((id) => (
              <button key={id} type="button" title={tooltipFor(id)} onClick={() => jumpToEvidence(id)} style={{ ...chipStyle, cursor: 'pointer', userSelect: 'none' }}>
                {labelFor(id)}
              </button>
            ))}
          </div>
        )
      }

      const blockTitleFor = (b: any) => {
        const blockId = typeof b?.blockId === 'string' ? b.blockId : ''
        if (!blockId) return humanizeText(b?.blockTitle || b?.title || '')
        const blk = getBlock(rightBlocks, blockId) || getBlock(leftBlocks, blockId)
        const txt = String(blk?.text || '').trim()
        if (txt) {
          const first = txt.split('\n').map((x) => x.trim()).filter(Boolean)[0] || ''
          if (first) {
            const cleaned = first.replace(/\s+/g, ' ').replace(/^第?\s*\d+\s*[条款章节部分]\s*/g, '').trim()
            const clipped = cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned
            if (clipped) return clipped
          }
        }
        return labelFor(blockId)
      }

      const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'separate', borderSpacing: 0 }
      const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 12, color: 'var(--muted)', padding: '8px 8px', borderBottom: '1px solid var(--control-border)', background: 'rgba(255,255,255,0.03)' }
      const tdStyle: React.CSSProperties = { verticalAlign: 'top', fontSize: 13, color: 'var(--text)', padding: '8px 8px', borderBottom: '1px solid var(--control-border)' }

      if (!parsed || typeof parsed !== 'object') {
        return (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)' }}>
            {raw}
          </pre>
        )
      }

      const overallRiskLevel = parsed.overallRiskLevel
      const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
      const confidence = parsed.confidence
      const keyFindings = Array.isArray(parsed.keyFindings) ? parsed.keyFindings : []
      const improvementSuggestions = Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : []
      const missingInformation = Array.isArray(parsed.missingInformation) ? parsed.missingInformation : []
      const sections = Array.isArray(parsed.sections) ? parsed.sections : []
      const blockReviews = Array.isArray(parsed.blockReviews) ? parsed.blockReviews : []

      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 900 }}>{t('globalAnalyze.conclusion')}</div>
              {riskBadge(overallRiskLevel)}
              {confidence !== undefined && confidence !== null && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('globalAnalyze.confidence', { value: Number(confidence).toFixed(2) })}</span>
              )}
            </div>
            <button className="btn-secondary" onClick={() => setGlobalAnalyzeShowRaw((v) => !v)}>
              {globalAnalyzeShowRaw ? t('globalAnalyze.raw.hide') : t('globalAnalyze.raw.show')}
            </button>
          </div>

          {summary ? (
            <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'var(--control-bg)', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {humanizeText(summary)}
            </div>
          ) : null}

          {keyFindings.length > 0 && (
            <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--control-bg)' }}>
              <div style={{ padding: 12, fontWeight: 900 }}>{t('globalAnalyze.keyFindings')}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 180 }}>{t('globalAnalyze.table.issue')}</th>
                      <th style={thStyle}>{t('globalAnalyze.table.detail')}</th>
                      <th style={{ ...thStyle, width: 220 }}>{t('globalAnalyze.table.evidence')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keyFindings.map((x: any, idx: number) => (
                      <tr key={String(x?.title || idx)}>
                        <td style={tdStyle}>{humanizeText(x?.title || '')}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>{humanizeText(x?.detail || '')}</td>
                        <td style={tdStyle}>{evidenceChips(x?.evidenceIds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {improvementSuggestions.length > 0 && (
            <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--control-bg)' }}>
              <div style={{ padding: 12, fontWeight: 900 }}>{t('globalAnalyze.suggestions')}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 72 }}>{t('globalAnalyze.table.priority')}</th>
                      <th style={{ ...thStyle, width: 180 }}>{t('globalAnalyze.table.suggestion')}</th>
                      <th style={thStyle}>{t('globalAnalyze.table.content')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {improvementSuggestions.map((x: any, idx: number) => (
                      <tr key={String(x?.title || idx)}>
                        <td style={tdStyle}>{priorityBadge(x?.priority)}</td>
                        <td style={tdStyle}>{humanizeText(x?.title || '')}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>{humanizeText(x?.detail || '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {missingInformation.length > 0 && (
            <div style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'var(--control-bg)' }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>{t('globalAnalyze.missing')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {missingInformation.map((x: any, idx: number) => (
                  <span key={String(x || idx)} style={chipStyle}>
                    {humanizeText(x || '')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sections.length > 0 && (
            <details style={{ border: '1px solid var(--control-border)', borderRadius: 12, background: 'var(--control-bg)', padding: 12 }} open>
              <summary style={{ cursor: 'pointer', fontWeight: 900 }}>{t('globalAnalyze.sections')}</summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))', gap: 10 }}>
                {sections.map((s: any, idx: number) => (
                  <div key={String(s?.title || idx)} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 900 }}>{humanizeText(s?.title || '')}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {riskBadge(s?.riskLevel)}
                        {Array.isArray(s?.evidenceIds) && s.evidenceIds.length > 0 && (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('globalAnalyze.evidenceCount', { count: s.evidenceIds.length })}</span>
                        )}
                      </div>
                    </div>
                    {Array.isArray(s?.findings) && s.findings.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
                        <div style={{ fontWeight: 850, color: 'var(--muted)' }}>{t('globalAnalyze.table.issue')}</div>
                        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                          {s.findings.map((x: any, i2: number) => (
                            <div key={String(x || i2)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {humanizeText(x || '')}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(s?.suggestions) && s.suggestions.length > 0 && (
                      <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                        <div style={{ fontWeight: 850, color: 'var(--muted)' }}>{t('globalAnalyze.table.suggestion')}</div>
                        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                          {s.suggestions.map((x: any, i2: number) => (
                            <div key={String(x || i2)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {humanizeText(x || '')}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>{evidenceChips(s?.evidenceIds)}</div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {blockReviews.length > 0 && (
            <details style={{ border: '1px solid var(--control-border)', borderRadius: 12, background: 'var(--control-bg)', padding: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 900 }}>{t('globalAnalyze.blocks')}</summary>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))', gap: 10 }}>
                {blockReviews.slice(0, 60).map((b: any, idx: number) => (
                  <div key={String(b?.blockId || idx)} style={{ border: '1px solid var(--control-border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 900 }} title={typeof b?.blockId === 'string' ? `${labelFor(b.blockId)}（${b.blockId}）` : undefined}>
                        {blockTitleFor(b)}
                      </div>
                      {riskBadge(b?.riskLevel)}
                    </div>
                    {Array.isArray(b?.issues) && b.issues.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
                        <div style={{ fontWeight: 850, color: 'var(--muted)' }}>{t('globalAnalyze.table.issue')}</div>
                        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                          {b.issues.map((x: any, i2: number) => (
                            <div key={String(x || i2)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {humanizeText(x || '')}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(b?.suggestions) && b.suggestions.length > 0 && (
                      <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                        <div style={{ fontWeight: 850, color: 'var(--muted)' }}>{t('globalAnalyze.table.suggestion')}</div>
                        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                          {b.suggestions.map((x: any, i2: number) => (
                            <div key={String(x || i2)} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {humanizeText(x || '')}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {blockReviews.length > 60 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('globalAnalyze.shownFirst', { count: 60 })}</div>}
              </div>
            </details>
          )}

          {globalAnalyzeShowRaw && (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)' }}>
              {raw}
            </pre>
          )}
        </div>
      )
    } catch {
      return (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.6, padding: 12, borderRadius: 12, border: '1px solid var(--control-border)', background: 'var(--control-bg)' }}>
          {raw}
        </pre>
      )
    }
  }

  return (
    <div style={{ marginTop: 14, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800 }}>{t('global.title')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {aiAnalyzeEnabled && globalAnalyzeLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t('mid.globalAnalyze.loading')}</div>
              <div className="scrollbar-progress" aria-hidden="true">
                <div className="thumb" />
              </div>
            </div>
          )}
          <button className="btn-secondary" disabled={globalAnalyzeLoading || diffRows.length === 0 || !aiAnalyzeEnabled} onClick={runGlobalAnalyze}>
            {globalAnalyzeLoading ? t('global.reanalyze.loading') : t('global.reanalyze')}
          </button>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>{renderGlobalAnalyze()}</div>
    </div>
  )
}

